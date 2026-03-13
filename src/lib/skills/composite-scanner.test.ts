import { describe, it, expect } from "vitest";
import { CompositeScanner } from "./composite-scanner";
import { BuiltInScanner, SCANNER_VERSION, type SecurityScanner, type ScanResult } from "./security-scan";

/** Helper to create a stub scanner that returns a fixed result */
function stubScanner(result: Partial<ScanResult>): SecurityScanner {
  return {
    scan: async (file, _fileName) => ({
      status: "clean",
      fileHash: "abc123",
      fileSizeBytes: file.length,
      findings: [],
      scannerVersion: SCANNER_VERSION,
      ...result,
    }),
  };
}

describe("CompositeScanner", () => {
  it("throws if no scanners provided", () => {
    expect(() => new CompositeScanner([])).toThrow("at least one scanner");
  });

  it("returns clean when single scanner finds nothing", async () => {
    const composite = new CompositeScanner([new BuiltInScanner()]);
    const file = Buffer.from("const x = 1;");
    const result = await composite.scan(file, "safe.ts");

    expect(result.status).toBe("clean");
    expect(result.findings).toHaveLength(0);
    expect(result.scannerVersion).toBe(SCANNER_VERSION);
  });

  it("merges findings from multiple scanners and deduplicates by rule", async () => {
    const scanner1 = stubScanner({
      status: "suspicious",
      findings: [
        { rule: "no-eval", severity: "high", detail: "eval detected" },
        { rule: "no-exec", severity: "medium", detail: "exec detected" },
      ],
    });
    const scanner2 = stubScanner({
      status: "clean",
      findings: [
        { rule: "no-eval", severity: "high", detail: "eval detected (scanner2)" }, // duplicate
        { rule: "custom-rule", severity: "low", detail: "custom finding" },
      ],
    });

    const composite = new CompositeScanner([scanner1, scanner2]);
    const result = await composite.scan(Buffer.from("x"), "test.ts");

    // Should have 3 unique findings (no-eval deduped)
    expect(result.findings).toHaveLength(3);
    const rules = result.findings.map((f) => f.rule);
    expect(rules).toContain("no-eval");
    expect(rules).toContain("no-exec");
    expect(rules).toContain("custom-rule");

    // The first occurrence of no-eval should win
    const evalFinding = result.findings.find((f) => f.rule === "no-eval");
    expect(evalFinding?.detail).toBe("eval detected");
  });

  it("takes the worst status across scanners", async () => {
    const cleanScanner = stubScanner({ status: "clean" });
    const suspiciousScanner = stubScanner({ status: "suspicious" });
    const maliciousScanner = stubScanner({ status: "malicious" });

    // clean + suspicious = suspicious
    let composite = new CompositeScanner([cleanScanner, suspiciousScanner]);
    let result = await composite.scan(Buffer.from("x"), "test.ts");
    expect(result.status).toBe("suspicious");

    // clean + malicious = malicious
    composite = new CompositeScanner([cleanScanner, maliciousScanner]);
    result = await composite.scan(Buffer.from("x"), "test.ts");
    expect(result.status).toBe("malicious");

    // suspicious + malicious = malicious
    composite = new CompositeScanner([suspiciousScanner, maliciousScanner]);
    result = await composite.scan(Buffer.from("x"), "test.ts");
    expect(result.status).toBe("malicious");
  });

  it("worst status: error and timeout rank between suspicious and malicious", async () => {
    const errorScanner = stubScanner({ status: "error" });
    const suspiciousScanner = stubScanner({ status: "suspicious" });

    const composite = new CompositeScanner([suspiciousScanner, errorScanner]);
    const result = await composite.scan(Buffer.from("x"), "test.ts");
    expect(result.status).toBe("error");
  });

  it("preserves fileHash from the first scanner", async () => {
    const scanner1 = stubScanner({ fileHash: "hash-from-scanner1" });
    const scanner2 = stubScanner({ fileHash: "hash-from-scanner2" });

    const composite = new CompositeScanner([scanner1, scanner2]);
    const result = await composite.scan(Buffer.from("x"), "test.ts");
    expect(result.fileHash).toBe("hash-from-scanner1");
  });

  it("works with the real BuiltInScanner detecting eval", async () => {
    const composite = new CompositeScanner([new BuiltInScanner()]);
    const file = Buffer.from('eval("bad")');
    const result = await composite.scan(file, "bad.ts");

    expect(result.status).toBe("suspicious");
    expect(result.findings.some((f) => f.rule === "no-eval")).toBe(true);
  });
});
