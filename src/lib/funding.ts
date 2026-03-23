/**
 * Funding tier definitions matching docs/funding.md
 */

export const FUNDING_TIERS = {
  credits_100k: {
    id: "credits_100k" as const,
    label: "100k Credits",
    sats: 100_000,
    creditsAwarded: 100_000, // $100 worth
    usdValue: 100,
    description: "100,000 sats → $100 in platform credits",
  },
  credits_500k: {
    id: "credits_500k" as const,
    label: "500k Credits",
    sats: 500_000,
    creditsAwarded: 600_000, // $600 worth (discount)
    usdValue: 600,
    description: "500,000 sats → $600 in platform credits (20% bonus)",
  },
  credits_1m: {
    id: "credits_1m" as const,
    label: "1M Credits",
    sats: 1_000_000,
    creditsAwarded: 1_500_000, // $1500 worth (discount)
    usdValue: 1500,
    description: "1,000,000 sats → $1,500 in platform credits (50% bonus)",
  },
  lifetime: {
    id: "lifetime" as const,
    label: "Lifetime Premium",
    sats: 200_000, // ~$20 at typical rate
    creditsAwarded: 0,
    usdValue: 20,
    description: "Lifetime Premium plan — unlimited job postings, premium placement, API access, Founder badge",
  },
  supporter: {
    id: "supporter" as const,
    label: "Supporter",
    sats: 10_000,
    creditsAwarded: 0,
    usdValue: 1,
    description: "10,000–50,000 sats → Supporter badge",
  },
} as const;

export type FundingTierId = keyof typeof FUNDING_TIERS;

export const VALID_FUNDING_TIERS: FundingTierId[] = Object.keys(FUNDING_TIERS) as FundingTierId[];

/** The USD threshold for automatic lifetime premium */
export const LIFETIME_THRESHOLD_USD = 20;

/** Invoice expiry in seconds (10 minutes) */
export const INVOICE_EXPIRY_SECONDS = 600;
