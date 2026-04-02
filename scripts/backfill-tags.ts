#!/usr/bin/env tsx
/**
 * Backfill AI-generated tags AND descriptions for directory listings.
 * 
 * Usage: tsx scripts/backfill-tags.ts
 * 
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY in .env
 */

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { config } from "dotenv";

config(); // load .env

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_KEY = process.env.OPENAI_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

function fallbackTags(title: string): string[] {
  const stopWords = new Set(["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "is", "it", "by", "with", "from", "as", "this", "that", "your", "our", "my"]);
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 5);
}

function extractVisibleText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ugig-bot/1.0)" },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!res.ok) return "";
    const html = (await res.text()).substring(0, 200000);
    return extractVisibleText(html).substring(0, 3000);
  } catch {
    return "";
  }
}

async function generateDescription(title: string, existingDesc: string, pageText: string, url: string): Promise<string> {
  try {
    const prompt = `Write a concise 1-2 sentence description for this project/website listing in a directory. Be specific about what it does. No marketing fluff. Max 200 characters.

Title: ${title}
URL: ${url}
${existingDesc ? `Existing description: ${existingDesc}` : ""}
Page content: ${pageText.substring(0, 2000)}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (content && content.length > 20) return content;
    return existingDesc;
  } catch (err) {
    console.error(`  Description AI failed: ${err instanceof Error ? err.message : err}`);
    return existingDesc;
  }
}

async function generateTags(title: string, description: string, url: string): Promise<string[]> {
  try {
    const prompt = `Given this website, generate 5-8 relevant tags/topics. Return only a JSON object like {"tags": ["tag1", "tag2"]}. Lowercase only. No explanation.

Title: ${title}
Description: ${description}
URL: ${url}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return fallbackTags(title);

    const parsed = JSON.parse(content);
    const arr = Array.isArray(parsed) ? parsed : parsed.tags;
    if (!Array.isArray(arr)) return fallbackTags(title);

    return arr
      .filter((t: unknown) => typeof t === "string")
      .map((t: string) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8);
  } catch (err) {
    console.error(`  AI failed: ${err instanceof Error ? err.message : err}`);
    return fallbackTags(title);
  }
}

async function main() {
  console.log("Fetching listings with empty tags...");

  // Fetch all active listings — we'll check what needs backfilling per-listing
  const { data: listings, error } = await supabase
    .from("project_listings")
    .select("id, title, description, url, tags")
    .eq("status", "active");

  if (error) {
    console.error("Failed to fetch listings:", error.message);
    process.exit(1);
  }

  if (!listings || listings.length === 0) {
    console.log("No listings found. Done.");
    return;
  }

  // Filter to listings that need tags or description
  const needsWork = listings.filter(
    (l) => !l.tags || l.tags.length === 0 || !l.description || l.description.length < 50
  );

  if (needsWork.length === 0) {
    console.log(`All ${listings.length} listings already have tags and descriptions. Done.`);
    return;
  }

  console.log(`Found ${needsWork.length} listings to backfill (of ${listings.length} total).\n`);

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < needsWork.length; i++) {
    const listing = needsWork[i];
    console.log(`[${i + 1}/${needsWork.length}] ${listing.title}`);
    console.log(`  URL: ${listing.url}`);

    try {
      const updates: Record<string, unknown> = {};
      const needsTags = !listing.tags || listing.tags.length === 0;
      const needsDesc = !listing.description || listing.description.length < 50;

      // Fetch page text if we need description
      let pageText = "";
      if (needsDesc) {
        pageText = await fetchPageText(listing.url);
      }

      if (needsDesc) {
        const desc = await generateDescription(
          listing.title || "",
          listing.description || "",
          pageText,
          listing.url
        );
        if (desc && desc.length > 20) {
          updates.description = desc;
          console.log(`  Description: ${desc}`);
        }
      }

      if (needsTags) {
        const tags = await generateTags(
          listing.title || "",
          (updates.description as string) || listing.description || "",
          listing.url
        );
        if (tags.length > 0) {
          updates.tags = tags;
          console.log(`  Tags: ${tags.join(", ")}`);
        }
      }

      if (Object.keys(updates).length === 0) {
        console.log("  Nothing to update, skipping.");
        continue;
      }

      const { error: updateError } = await supabase
        .from("project_listings")
        .update(updates)
        .eq("id", listing.id);

      if (updateError) {
        console.error(`  Update failed: ${updateError.message}`);
        errors++;
      } else {
        updated++;
      }
    } catch (err) {
      console.error(`  Error: ${err instanceof Error ? err.message : err}`);
      errors++;
    }

    // Rate limit
    if (i < needsWork.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`\nDone! Updated: ${updated}, Errors: ${errors}, Total: ${needsWork.length}`);
}

main();
