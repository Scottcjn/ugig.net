import { describe, it, expect } from "vitest";
import { calculateCommission, calculatePlatformFee } from "./commission";

describe("calculateCommission", () => {
  it("calculates percentage commission", () => {
    const result = calculateCommission(
      { commission_rate: 0.20, commission_type: "percentage", commission_flat_sats: 0 },
      10000
    );
    expect(result).toBe(2000);
  });

  it("calculates flat commission", () => {
    const result = calculateCommission(
      { commission_rate: 0.20, commission_type: "flat", commission_flat_sats: 500 },
      10000
    );
    expect(result).toBe(500);
  });

  it("floors fractional sats", () => {
    const result = calculateCommission(
      { commission_rate: 0.15, commission_type: "percentage", commission_flat_sats: 0 },
      333
    );
    expect(result).toBe(49); // floor(333 * 0.15 = 49.95)
  });

  it("returns 0 for flat with no amount set", () => {
    const result = calculateCommission(
      { commission_rate: 0.20, commission_type: "flat", commission_flat_sats: 0 },
      10000
    );
    expect(result).toBe(0);
  });
});

describe("calculatePlatformFee", () => {
  it("takes 5% of commission", () => {
    expect(calculatePlatformFee(2000)).toBe(100); // 5% of 2000
  });

  it("floors fractional amounts", () => {
    expect(calculatePlatformFee(333)).toBe(16); // floor(333 * 0.05 = 16.65)
  });

  it("returns 0 for zero commission", () => {
    expect(calculatePlatformFee(0)).toBe(0);
  });
});
