import { describe, it, expect } from "vitest";
import { validateOfferInput, stripHtmlTags, isValidUrl } from "./validation";

describe("stripHtmlTags", () => {
  it("removes HTML tags from strings", () => {
    expect(stripHtmlTags('<script>alert("xss")</script>Hello')).toBe('alert("xss")Hello');
    expect(stripHtmlTags("<b>Bold</b> text")).toBe("Bold text");
    expect(stripHtmlTags("No tags here")).toBe("No tags here");
    expect(stripHtmlTags('<img src="x" onerror="alert(1)">')).toBe("");
  });
});

describe("isValidUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("http://example.com/path")).toBe(true);
  });

  it("rejects javascript: URLs (#18 XSS)", () => {
    expect(isValidUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects data: URLs", () => {
    expect(isValidUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects vbscript: URLs", () => {
    expect(isValidUrl("vbscript:MsgBox")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isValidUrl("not-a-url")).toBe(false);
    expect(isValidUrl("")).toBe(false);
  });
});

describe("validateOfferInput", () => {
  const validInput = {
    title: "Test Offer Title",
    description: "This is a valid description for the offer",
    product_url: "https://example.com",
    price_sats: 1000,
    commission_type: "percentage",
    commission_rate: 0.2,
  };

  it("accepts valid input", () => {
    const result = validateOfferInput({ ...validInput });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects javascript: URL in product_url (#18)", () => {
    const result = validateOfferInput({
      ...validInput,
      product_url: "javascript:alert(document.cookie)",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("product_url"))).toBe(true);
  });

  it("strips HTML tags from title (#26)", () => {
    const result = validateOfferInput({
      ...validInput,
      title: '<script>alert("xss")</script>Legit Title',
    });
    expect(result.ok).toBe(true);
    expect(result.sanitized!.title).toBe('alert("xss")Legit Title');
    expect(result.sanitized!.title).not.toContain("<script>");
  });

  it("strips HTML tags from description (#26)", () => {
    const result = validateOfferInput({
      ...validInput,
      description: '<img src=x onerror=alert(1)>A valid description here',
    });
    expect(result.ok).toBe(true);
    expect(result.sanitized!.description).not.toContain("<img");
  });

  it("rejects negative commission_flat_sats (#23)", () => {
    const result = validateOfferInput({
      ...validInput,
      commission_type: "flat",
      commission_flat_sats: -100,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("commission_flat_sats") || e.includes("non-negative"))).toBe(true);
  });

  it("defaults price_sats to 0 when not provided (#28)", () => {
    const input = { ...validInput };
    delete (input as any).price_sats;
    const result = validateOfferInput(input as any);
    expect(result.ok).toBe(true);
    expect(result.sanitized!.price_sats).toBe(0);
  });

  it("rejects negative price_sats with field name in error (#28)", () => {
    const result = validateOfferInput({
      ...validInput,
      price_sats: -10,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("price_sats"))).toBe(true);
  });
});
