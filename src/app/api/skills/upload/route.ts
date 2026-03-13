import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getDefaultScanner,
  scanWithRetry,
  isScanAcceptable,
} from "@/lib/skills/security-scan";

const BUCKET = "skill-files";

/**
 * POST /api/skills/upload - Upload a skill file with security scanning
 *
 * Requires authentication. Accepts multipart form data with:
 *   - file: the skill file
 *   - listing_id: UUID of the skill listing (must be owned by caller)
 *
 * Flow:
 *   1. Validate auth + ownership
 *   2. Run SkillScanner security scan
 *   3. Persist scan results
 *   4. If clean, store file in Supabase Storage; otherwise reject
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const listingId = formData.get("listing_id") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!listingId) {
      return NextResponse.json({ error: "listing_id is required" }, { status: 400 });
    }

    const admin = createServiceClient();

    // Verify listing exists and caller owns it
    const { data: listing, error: listingError } = await admin
      .from("skill_listings" as any)
      .select("id, seller_id, slug")
      .eq("id", listingId)
      .single();

    if (listingError || !listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if ((listing as any).seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Run security scan
    const scanner = getDefaultScanner();
    const scanResult = await scanWithRetry(scanner, buffer, file.name, {
      maxRetries: 2,
      timeoutMs: 30_000,
    });

    // Storage path: {seller_id}/{slug}/{filename}
    const storagePath = `${auth.user.id}/${(listing as any).slug}/${file.name}`;

    // Persist scan record
    const { data: scanRecord, error: scanError } = await admin
      .from("skill_security_scans" as any)
      .insert({
        listing_id: listingId,
        file_path: storagePath,
        file_hash: scanResult.fileHash,
        file_size_bytes: scanResult.fileSizeBytes,
        scan_status: scanResult.status,
        findings_summary: {
          risk_level: scanResult.status,
          issues: scanResult.findings,
          scanner_version: scanResult.scannerVersion,
        },
        scanned_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (scanError) {
      console.error("Failed to persist scan record:", scanError);
    }

    // Update listing scan_status
    await admin
      .from("skill_listings" as any)
      .update({ scan_status: scanResult.status })
      .eq("id", listingId);

    // Reject if scan is not clean
    if (!isScanAcceptable(scanResult)) {
      return NextResponse.json(
        {
          error: "File rejected by security scan",
          scan: {
            status: scanResult.status,
            findings: scanResult.findings,
            scan_id: (scanRecord as any)?.id,
          },
        },
        { status: 422 }
      );
    }

    // Upload to Supabase Storage (service role bypasses RLS)
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true, // overwrite if re-uploading
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to store file" },
        { status: 500 }
      );
    }

    // Update listing with file path
    await admin
      .from("skill_listings" as any)
      .update({
        skill_file_path: storagePath,
        scan_status: "clean",
      })
      .eq("id", listingId);

    return NextResponse.json(
      {
        ok: true,
        file_path: storagePath,
        scan: {
          status: scanResult.status,
          file_hash: scanResult.fileHash,
          file_size_bytes: scanResult.fileSizeBytes,
          findings: scanResult.findings,
          scanner_version: scanResult.scannerVersion,
          scan_id: (scanRecord as any)?.id,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
