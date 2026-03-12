import { describe, it, expect } from "vitest";
import { validateOfferInput } from "./validation";

describe("validateOfferInput", () => {
  const validInput = {
    title: "Test Offer",
    description: "A valid description for testing purposes",
    price_sats: 10000,
  };

  it("accepts valid input", () => {
    const result = validateOfferInput(validInput);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.sanitized).toBeDefined();
  });

  it("applies defaults", () => {
    const result = validateOfferInput(validInput);
    expect(result.sanitized?.commission_rate).toBe(0.20);
    expect(result.sanitized?.cookie_days).toBe(30);
    expect(result.sanitized?.settlement_delay_days).toBe(7);
    expect(result.sanitized?.product_type).toBe("digital");
    expect(result.sanitized?.commission_type).toBe("percentage");
  });

  it("rejects short title", () => {
    const result = validateOfferInput({ ...validInput, title: "ab" });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Title must be at least 3 characters");
  });

  it("rejects short description", () => {
    const result = validateOfferInput({ ...validInput, description: "short" });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Description must be at least 10 characters");
  });

  it("rejects negative price", () => {
    const result = validateOfferInput({ ...validInput, price_sats: -1 });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Price must be a non-negative number");
  });

  it("rejects commission rate below 1%", () => {
    const result = validateOfferInput({ ...validInput, commission_rate: 0.005 });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Commission rate must be between 1% and 90%");
  });

  it("rejects commission rate above 90%", () => {
    const result = validateOfferInput({ ...validInput, commission_rate: 0.95 });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Commission rate must be between 1% and 90%");
  });

  it("rejects invalid product type", () => {
    const result = validateOfferInput({ ...validInput, product_type: "invalid" });
    expect(result.ok).toBe(false);
  });

  it("rejects too many tags", () => {
    const result = validateOfferInput({
      ...validInput,
      tags: Array(11).fill("tag"),
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Maximum 10 tags");
  });

  it("sanitizes tags to lowercase", () => {
    const result = validateOfferInput({
      ...validInput,
      tags: ["AI", " Coding ", "TOOLS"],
    });
    expect(result.ok).toBe(true);
    expect(result.sanitized?.tags).toEqual(["ai", "coding", "tools"]);
  });

  it("accepts custom commission rate", () => {
    const result = validateOfferInput({ ...validInput, commission_rate: 0.35 });
    expect(result.ok).toBe(true);
    expect(result.sanitized?.commission_rate).toBe(0.35);
  });
});
