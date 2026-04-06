import { z } from "zod";
import { PROMPT_CATEGORIES } from "@/lib/constants";

/**
 * Generate a URL-friendly slug from a title.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export const promptListingSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(120, "Title must be under 120 characters"),
  tagline: z
    .string()
    .max(200, "Tagline must be under 200 characters")
    .optional()
    .or(z.literal("")),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(10000),
  price_sats: z
    .number()
    .int()
    .min(0, "Price cannot be negative"),
  category: z.enum(PROMPT_CATEGORIES as unknown as [string, ...string[]]).optional(),
  tags: z
    .array(z.string().max(30))
    .max(10, "Maximum 10 tags")
    .optional()
    .default([]),
  status: z.enum(["draft", "active"]).optional().default("draft"),
  prompt_text: z.string().min(1, "Prompt text is required").max(50000, "Prompt text must be under 50000 characters"),
  model_compatibility: z
    .array(z.string().max(50))
    .max(20, "Maximum 20 model compatibility entries")
    .optional()
    .default([]),
  example_output: z.string().max(10000, "Example output must be under 10000 characters").optional().or(z.literal("")),
  use_case: z.string().max(500, "Use case must be under 500 characters").optional().or(z.literal("")),
});

export type PromptListingInput = z.infer<typeof promptListingSchema>;

export const promptReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional().or(z.literal("")),
});

export type PromptReviewInput = z.infer<typeof promptReviewSchema>;
