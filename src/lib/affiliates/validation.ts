import { AFFILIATE_PRODUCT_TYPES, SKILL_CATEGORIES } from "@/lib/constants";

export interface OfferInput {
  title: string;
  description: string;
  product_url?: string;
  product_type?: string;
  price_sats: number;
  commission_rate?: number;
  commission_type?: string;
  commission_flat_sats?: number;
  cookie_days?: number;
  settlement_delay_days?: number;
  promo_text?: string;
  category?: string;
  tags?: string[];
  listing_id?: string;
  status?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  sanitized?: OfferInput;
}

export function validateOfferInput(input: OfferInput): ValidationResult {
  const errors: string[] = [];

  if (!input.title || input.title.trim().length < 3) {
    errors.push("Title must be at least 3 characters");
  }
  if (input.title && input.title.length > 200) {
    errors.push("Title must be under 200 characters");
  }

  if (!input.description || input.description.trim().length < 10) {
    errors.push("Description must be at least 10 characters");
  }

  if (typeof input.price_sats !== "number" || input.price_sats < 0) {
    errors.push("Price must be a non-negative number");
  }

  const commissionType = input.commission_type || "percentage";

  if (commissionType === "percentage") {
    const commissionRate = input.commission_rate ?? 0.20;
    if (commissionRate < 0.01 || commissionRate > 0.90) {
      errors.push("Commission rate must be between 1% and 90%");
    }
  } else if (commissionType === "flat") {
    const flatSats = input.commission_flat_sats ?? 0;
    if (flatSats < 1) {
      errors.push("Flat commission must be at least 1 sat");
    }
  }

  const cookieDays = input.cookie_days ?? 30;
  if (cookieDays < 1 || cookieDays > 365) {
    errors.push("Cookie window must be 1-365 days");
  }

  const settlementDays = input.settlement_delay_days ?? 7;
  if (settlementDays < 1 || settlementDays > 90) {
    errors.push("Settlement delay must be 1-90 days");
  }

  if (input.product_type && !AFFILIATE_PRODUCT_TYPES.includes(input.product_type as any)) {
    errors.push(`Product type must be one of: ${AFFILIATE_PRODUCT_TYPES.join(", ")}`);
  }

  if (input.category && !SKILL_CATEGORIES.includes(input.category as any)) {
    errors.push(`Category must be one of: ${SKILL_CATEGORIES.join(", ")}`);
  }

  if (input.tags && input.tags.length > 10) {
    errors.push("Maximum 10 tags");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    sanitized: {
      ...input,
      title: input.title.trim(),
      description: input.description.trim(),
      commission_rate: commissionType === "percentage" ? (input.commission_rate ?? 0.20) : 0,
      commission_type: input.commission_type || "percentage",
      cookie_days: cookieDays,
      settlement_delay_days: settlementDays,
      product_type: input.product_type || "digital",
      tags: input.tags?.map((t) => t.trim().toLowerCase()).filter(Boolean) || [],
    },
  };
}
