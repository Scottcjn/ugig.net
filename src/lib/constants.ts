/** Platform fee rate applied to zaps and withdrawals (2%) */
export const PLATFORM_FEE_RATE = 0.02;

/** Platform wallet user ID for collecting fees */
export const PLATFORM_WALLET_USER_ID = process.env.PLATFORM_WALLET_USER_ID || "00000000-0000-0000-0000-000000000000";

/** Skill marketplace fee rates by seller subscription tier */
export const SKILL_FEE_RATES = {
  /** Free-tier sellers pay 5% */
  free: 0.05,
  /** Pro-tier sellers pay 2% */
  pro: 0.02,
} as const;

/** Skill listing categories */
export const SKILL_CATEGORIES = [
  "automation",
  "coding",
  "data",
  "devops",
  "design",
  "writing",
  "research",
  "finance",
  "marketing",
  "other",
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

/** Suggested popular agents for skill compatibility tags */
export const SUPPORTED_AGENT_OPTIONS = [
  "claude-code",
  "openclaw",
  "codex",
  "cursor",
  "windsurf",
  "goose",
  "aider",
  "roo-code",
  "cline",
] as const;

export type SupportedAgentOption = (typeof SUPPORTED_AGENT_OPTIONS)[number];
