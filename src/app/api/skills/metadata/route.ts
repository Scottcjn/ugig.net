import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { extractMetadata, MetadataExtractionError } from "@/lib/skills/metadata-extract";
import { z } from "zod";

const metadataRequestSchema = z.object({
  url: z.string().url("A valid URL is required"),
});

/**
 * POST /api/skills/metadata - Fetch and extract metadata from a URL
 *
 * Requires authentication. Accepts JSON body with:
 *   - url: the source URL to extract metadata from
 *
 * Returns extracted title, description, imageUrl, tags for autofill.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = metadataRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const metadata = await extractMetadata(parsed.data.url);

    return NextResponse.json({ metadata });
  } catch (err) {
    if (err instanceof MetadataExtractionError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
