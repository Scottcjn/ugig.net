"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const REFERRAL_KEY = "ugig_referral_code";

/**
 * Captures ?ref= param from any page URL and stores it in localStorage.
 * Drop this component into the root layout so referrals persist across navigation.
 */
export function ReferralTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      localStorage.setItem(REFERRAL_KEY, ref);
    }
  }, [searchParams]);

  return null;
}

/** Read the stored referral code (call from signup form, etc.) */
export function getStoredReferral(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFERRAL_KEY);
}

/** Clear stored referral after successful signup */
export function clearStoredReferral(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REFERRAL_KEY);
}
