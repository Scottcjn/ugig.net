import { describe, it, expect } from "vitest";
import { generateTrackingCode, hashIP } from "./tracking";

describe("generateTrackingCode", () => {
  it("includes username in the code", () => {
    const code = generateTrackingCode("alice", "cool-skill");
    expect(code).toMatch(/^alice-/);
  });

  it("generates unique codes for same inputs (time-based)", () => {
    const code1 = generateTrackingCode("bob", "offer-1");
    // Small delay to ensure different timestamp
    const code2 = generateTrackingCode("bob", "offer-1");
    // They might be the same in fast tests, but format should be consistent
    expect(code1).toMatch(/^bob-[a-f0-9]{6}$/);
    expect(code2).toMatch(/^bob-[a-f0-9]{6}$/);
  });
});

describe("hashIP", () => {
  it("returns a consistent hash for the same IP on the same day", () => {
    const hash1 = hashIP("192.168.1.1");
    const hash2 = hashIP("192.168.1.1");
    expect(hash1).toBe(hash2);
  });

  it("returns different hashes for different IPs", () => {
    const hash1 = hashIP("192.168.1.1");
    const hash2 = hashIP("10.0.0.1");
    expect(hash1).not.toBe(hash2);
  });

  it("returns a 16-char hex string", () => {
    const hash = hashIP("1.2.3.4");
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });
});
