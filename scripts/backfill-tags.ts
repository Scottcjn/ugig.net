#!/usr/bin/env tsx
/**
 * Backfill AI-generated tags for directory listings that have empty/null tags.
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

  const { data: listings, error } = await supabase
    .from("project_listings")
    .select("id, title, description, url, tags")
    .eq("status", "active")
    .or("tags.is.null,tags.eq.{}");

  if (error) {
    console.error("Failed to fetch listings:", error.message);
    process.exit(1);
  }

  if (!listings || listings.length === 0) {
    console.log("No listings need tags. Done.");
    return;
  }

  console.log(`Found ${listings.length} listings to backfill.\n`);

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i];
    console.log(`[${i + 1}/${listings.length}] ${listing.title}`);
    console.log(`  URL: ${listing.url}`);

    try {
      const tags = await generateTags(
        listing.title || "",
        listing.description || "",
        listing.url
      );

      if (tags.length === 0) {
        console.log("  No tags generated, skipping.");
        continue;
      }

      const { error: updateError } = await supabase
        .from("project_listings")
        .update({ tags })
        .eq("id", listing.id);

      if (updateError) {
        console.error(`  Update failed: ${updateError.message}`);
        errors++;
      } else {
        console.log(`  Tags: ${tags.join(", ")}`);
        updated++;
      }
    } catch (err) {
      console.error(`  Error: ${err instanceof Error ? err.message : err}`);
      errors++;
    }

    // Rate limit: 1 second between requests
    if (i < listings.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`\nDone! Updated: ${updated}, Errors: ${errors}, Total: ${listings.length}`);
}

main();
