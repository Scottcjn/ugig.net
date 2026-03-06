/**
 * Lightweight spam/bot detection for usernames and names.
 * Returns { spam: boolean, reason?: string }
 */

// Common spam patterns
const SPAM_USERNAME_PATTERNS = [
  /^[a-z]{2,4}\d{5,}$/i,          // ab12345, xyz99999
  /^user\d{4,}$/i,                  // user12345
  /^[a-z]+_[a-z]+\d{3,}$/i,        // first_last123
  /\d{8,}/,                          // 8+ consecutive digits
  /^[a-z0-9]{20,}$/,                // 20+ random alphanumeric
  /(.)\1{4,}/,                       // 5+ repeated chars: aaaaa
  /^(buy|sell|cheap|free|promo|discount|crypto|nft|airdrop|casino|poker|viagra|cialis)/i,
  /(seo|marketing|agency|boost|traffic|followers|likes)\d*$/i,
];

const SPAM_NAME_PATTERNS = [
  /^[A-Z][a-z]+ [A-Z][a-z]+\d+$/,  // "John Smith123"
  /(.)\1{3,}/,                       // 4+ repeated chars
  /\d{4,}/,                          // 4+ digits in name
  /^[^a-zA-Z\s\-'.]+$/,             // no letters at all
  /(http|www\.|\.com|\.net|\.org)/i, // URLs in name
  /^(admin|moderator|support|helpdesk|official)/i,
  /[^\x00-\x7F]{10,}/,              // 10+ non-ASCII (excessive unicode)
];

// Keyboard-mash detection: check consonant clusters
function isKeyboardMash(str: string): boolean {
  const lower = str.toLowerCase().replace(/[^a-z]/g, "");
  if (lower.length < 6) return false;
  // Count vowels
  const vowels = lower.replace(/[^aeiou]/g, "").length;
  const ratio = vowels / lower.length;
  // Normal English ~38% vowels; below 10% is suspicious
  return ratio < 0.1 && lower.length > 8;
}

// Entropy check: random strings have high entropy
function shannonEntropy(str: string): number {
  const freq: Record<string, number> = {};
  for (const c of str) freq[c] = (freq[c] || 0) + 1;
  const len = str.length;
  return -Object.values(freq).reduce((sum, f) => {
    const p = f / len;
    return sum + p * Math.log2(p);
  }, 0);
}

export function checkSpam(
  username: string,
  fullName?: string | null
): { spam: boolean; reason?: string } {
  // Username checks
  for (const pattern of SPAM_USERNAME_PATTERNS) {
    if (pattern.test(username)) {
      return { spam: true, reason: "Username matches spam pattern" };
    }
  }

  if (isKeyboardMash(username)) {
    return { spam: true, reason: "Username appears to be random characters" };
  }

  // High entropy + long username = likely random/bot
  if (username.length > 12 && shannonEntropy(username) > 4.0) {
    return { spam: true, reason: "Username appears randomly generated" };
  }

  // Name checks
  if (fullName) {
    for (const pattern of SPAM_NAME_PATTERNS) {
      if (pattern.test(fullName)) {
        return { spam: true, reason: "Name matches spam pattern" };
      }
    }

    if (isKeyboardMash(fullName.replace(/\s/g, ""))) {
      return { spam: true, reason: "Name appears to be random characters" };
    }
  }

  return { spam: false };
}

// Common disposable/throwaway email domains
const DISPOSABLE_DOMAINS = new Set([
  "tempmail.com", "throwaway.email", "guerrillamail.com", "guerrillamail.net",
  "mailinator.com", "yopmail.com", "sharklasers.com", "guerrillamailblock.com",
  "grr.la", "dispostable.com", "mailnesia.com", "maildrop.cc", "discard.email",
  "tempail.com", "tempr.email", "temp-mail.org", "fakeinbox.com", "trashmail.com",
  "trashmail.net", "trashmail.me", "mohmal.com", "getnada.com", "emailondeck.com",
  "10minutemail.com", "minutemail.com", "tempinbox.com", "binkmail.com",
  "mailcatch.com", "mailexpire.com", "mailmoat.com", "mailnull.com",
  "mytrashmail.com", "spamfree24.org", "spamgourmet.com", "spamhereplease.com",
  "throwam.com", "trash-mail.at", "trashymail.com", "yopmail.fr", "yopmail.net",
  "jetable.org", "guerrillamail.info", "guerrillamail.biz", "guerrillamail.de",
  "guerrillamail.org", "harakirimail.com", "mailforspam.com",
]);

const SPAM_EMAIL_PATTERNS = [
  /^[a-z]{2,3}\d{6,}@/i,           // ab123456@...
  /^[a-z0-9]{20,}@/i,               // long random local part
  /\+.{10,}@/,                       // long plus-addressing (used for mass signups)
];

export function checkEmail(email: string): { spam: boolean; reason?: string } {
  const [localPart, domain] = email.toLowerCase().split("@");
  if (!localPart || !domain) return { spam: true, reason: "Invalid email" };

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { spam: true, reason: "Disposable email addresses are not allowed" };
  }

  for (const pattern of SPAM_EMAIL_PATTERNS) {
    if (pattern.test(email)) {
      return { spam: true, reason: "Email matches spam pattern" };
    }
  }

  return { spam: false };
}
