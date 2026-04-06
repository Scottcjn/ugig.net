import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { scanPrompt, PROMPT_SCANNER_VERSION } from "@/lib/prompts/security-scan";

/**
 * POST /api/prompts/[slug]/scan — Generate a prompt security report
 *
 * Runs regex-based scanning on the prompt content for:
 *   - Prompt injection patterns
 *   - Malicious content (suspicious URLs, encoded payloads)
 *   - PII/credential patterns
 *
 * Only the listing owner (seller) can trigger a scan.
 *
 * Persists a prompt_security_scans row and updates the listing's
 * cached scan_status + scan_rating.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceClient();

    // Fetch listing
    const { data: listing, error: listingError } = await admin
      .from("prompt_listings" as any)
      .select("id, seller_id, slug, prompt_text, example_output, use_case, description")
      .eq("slug", slug)
      .single();

    if (listingError || !listing) {
      return NextResponse.json({ error: "Prompt listing not found" }, { status: 404 });
    }

    const l = listing as any;

    // Only owner can trigger scans
    if (l.seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Need prompt text to scan
    if (!l.prompt_text) {
      return NextResponse.json(
        { error: "No scannable content — add prompt text" },
        { status: 422 }
      );
    }

    // ── Run scan ──────────────────────────────────────────────────
    const scanResult = scanPrompt({
      promptText: l.prompt_text,
      exampleOutput: l.example_output,
      useCase: l.use_case,
      description: l.description,
    });

    // ── Persist scan record ───────────────────────────────────────
    const { data: scanRecord, error: scanInsertError } = await admin
      .from("prompt_security_scans" as any)
      .insert({
        listing_id: l.id,
        scanner_version: scanResult.scannerVersion,
        status: scanResult.status,
        rating: scanResult.rating,
        security_score: scanResult.securityScore,
        findings: scanResult.findings,
      })
      .select("id")
      .single();

    if (scanInsertError) {
      console.error("Failed to persist prompt scan record:", scanInsertError);
    }

    // Update listing cached scan_status + scan_rating
    await admin
      .from("prompt_listings" as any)
      .update({
        scan_status: scanResult.status,
        scan_rating: scanResult.rating,
      })
      .eq("id", l.id);

    // ── Return sanitised response ─────────────────────────────────
    return NextResponse.json({
      scan: {
        status: scanResult.status,
        rating: scanResult.rating,
        security_score: scanResult.securityScore,
        findings_count: scanResult.findings.length,
        findings: scanResult.findings.map((f) => ({
          rule: f.rule,
          severity: f.severity,
          detail: f.detail,
        })),
        scanner_version: scanResult.scannerVersion,
        scan_id: (scanRecord as any)?.id ?? null,
        scanned_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("Prompt scan error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
