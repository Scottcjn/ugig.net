import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

// ── Supabase mock ──────────────────────────────────────────────────

const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
const mockSingle = vi.fn();
const mockSelectEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockSelectEq }));
const mockFrom = vi.fn((table: string) => {
  // update chain is only used for profiles DID update
  return { select: mockSelect, update: mockUpdate };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

// ── Email mock ─────────────────────────────────────────────────────

const mockSendEmail = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  welcomeEmail: vi.fn(({ name, accountType }: { name: string; accountType?: string }) => ({
    subject: `Welcome ${name}`,
    html: `<p>Welcome ${name} (${accountType})</p>`,
    text: `Welcome ${name}`,
  })),
}));

// ── Reputation mock ────────────────────────────────────────────────

const mockSubmitReputationAction = vi.fn().mockResolvedValue({});
vi.mock("@/lib/reputation", () => ({
  submitReputationAction: (...args: unknown[]) => mockSubmitReputationAction(...args),
  UGIG_PLATFORM_DID: "did:ugig.net:z6MkTestPlatformDid",
}));

// ── Fetch mock (for CoinPayPortal DID register) ────────────────────

const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
vi.stubGlobal("fetch", mockFetch);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(body: unknown, secret?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return new NextRequest("http://localhost/api/auth/confirmed", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function confirmationPayload(overrides?: {
  userId?: string;
  email?: string;
  alreadyConfirmed?: boolean;
  notConfirmed?: boolean;
}) {
  const {
    userId = "user-123",
    email = "test@example.com",
    alreadyConfirmed = false,
    notConfirmed = false,
  } = overrides || {};

  return {
    type: "UPDATE",
    record: {
      id: userId,
      email,
      email_confirmed_at: notConfirmed ? null : "2026-02-13T00:00:00Z",
    },
    old_record: {
      id: userId,
      email,
      email_confirmed_at: alreadyConfirmed ? "2026-02-12T00:00:00Z" : null,
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("POST /api/auth/confirmed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTH_WEBHOOK_SECRET;
    delete process.env.COINPAYPORTAL_API_URL;
    delete process.env.COINPAYPORTAL_REPUTATION_API_KEY;
    mockUpdateEq.mockResolvedValue({ error: null });
  });

  describe("email confirmation", () => {
    it("sends welcome email on new confirmation", async () => {
      mockSingle.mockResolvedValue({
        data: { username: "testuser", full_name: "Test User", account_type: "human", did: null },
        error: null,
      });

      const res = await POST(makeRequest(confirmationPayload()));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.emailSent).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "test@example.com", subject: "Welcome Test User" })
      );
    });

    it("sends agent-specific welcome for agent accounts", async () => {
      mockSingle.mockResolvedValue({
        data: { username: "myagent", full_name: null, account_type: "agent", did: null },
        error: null,
      });

      const res = await POST(makeRequest(confirmationPayload()));
      expect(res.status).toBe(200);
    });

    it("skips if email was already confirmed", async () => {
      const res = await POST(makeRequest(confirmationPayload({ alreadyConfirmed: true })));
      const json = await res.json();

      expect(json.skipped).toBe(true);
      expect(json.reason).toBe("already_confirmed");
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("skips if email not confirmed yet", async () => {
      const res = await POST(makeRequest(confirmationPayload({ notConfirmed: true })));
      const json = await res.json();

      expect(json.skipped).toBe(true);
      expect(json.reason).toBe("not_confirmed");
    });

    it("rejects unauthorized requests when secret is configured", async () => {
      process.env.AUTH_WEBHOOK_SECRET = "my-secret";
      const res = await POST(makeRequest(confirmationPayload(), "wrong-secret"));
      expect(res.status).toBe(401);
    });

    it("accepts authorized requests when secret matches", async () => {
      process.env.AUTH_WEBHOOK_SECRET = "my-secret";
      mockSingle.mockResolvedValue({
        data: { username: "testuser", full_name: null, account_type: "human", did: null },
        error: null,
      });

      const res = await POST(makeRequest(confirmationPayload(), "my-secret"));
      expect(res.status).toBe(200);
    });

    it("returns 400 for missing user data", async () => {
      const res = await POST(
        makeRequest({
          type: "UPDATE",
          record: { email_confirmed_at: "2026-02-13T00:00:00Z" },
          old_record: { email_confirmed_at: null },
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("DID auto-generation", () => {
    it("generates and stores a did:key when user has no DID", async () => {
      mockSingle.mockResolvedValue({
        data: { username: "newuser", full_name: "New User", account_type: "human", did: null },
        error: null,
      });

      const res = await POST(makeRequest(confirmationPayload()));
      expect(res.status).toBe(200);

      // Should have called update on profiles to store the DID
      expect(mockUpdate).toHaveBeenCalled();
      const updateArg = mockUpdate.mock.calls[0][0];
      expect(updateArg).toHaveProperty("did");
      expect(updateArg.did).toMatch(/^did:ugig.net:z/);

      // Should have called eq with the user ID
      expect(mockUpdateEq).toHaveBeenCalledWith("id", "user-123");
    });

    it("generates a valid did:key format (ed25519 multicodec)", async () => {
      mockSingle.mockResolvedValue({
        data: { username: "newuser", full_name: null, account_type: "human", did: null },
        error: null,
      });

      await POST(makeRequest(confirmationPayload()));

      const did = mockUpdate.mock.calls[0][0].did;
      // did:ugig.net:z<base58btc-encoded multicodec>
      expect(did).toMatch(/^did:ugig.net:z[1-9A-HJ-NP-Za-km-z]+$/);
    });

    it("skips DID generation when user already has a DID", async () => {
      mockSingle.mockResolvedValue({
        data: {
          username: "existinguser",
          full_name: "Existing",
          account_type: "human",
          did: "did:ugig.net:zExistingDid",
        },
        error: null,
      });

      const res = await POST(makeRequest(confirmationPayload()));
      expect(res.status).toBe(200);

      // Should NOT have called update (no DID generation needed)
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("does not block signup if DID generation fails", async () => {
      mockSingle.mockResolvedValue({
        data: { username: "newuser", full_name: "New", account_type: "human", did: null },
        error: null,
      });
      mockUpdateEq.mockResolvedValue({ error: { message: "DB error" } });

      const res = await POST(makeRequest(confirmationPayload()));
      // Should still return 200 — DID failure is non-fatal
      expect(res.status).toBe(200);
      expect(mockSendEmail).toHaveBeenCalled();
    });

    it("submits reputation action after DID creation", async () => {
      mockSingle.mockResolvedValue({
        data: { username: "newuser", full_name: null, account_type: "human", did: null },
        error: null,
      });

      await POST(makeRequest(confirmationPayload()));

      expect(mockSubmitReputationAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action_category: "identity.profile_update",
          action_type: "email_confirmed",
          agent_did: expect.stringMatching(/^did:ugig.net:z/),
        })
      );
    });
  });

  describe("CoinPayPortal DID registration", () => {
    it("registers DID on CoinPayPortal when API key is set", async () => {
      process.env.COINPAYPORTAL_API_URL = "https://coinpayportal.com";
      process.env.COINPAYPORTAL_REPUTATION_API_KEY = "test-api-key";

      mockSingle.mockResolvedValue({
        data: { username: "newuser", full_name: null, account_type: "human", did: null },
        error: null,
      });

      await POST(makeRequest(confirmationPayload()));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://coinpayportal.com/api/reputation/did/register",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
          }),
          body: expect.stringContaining("did:ugig.net:z"),
        })
      );

      // Verify the body contains expected fields
      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody).toHaveProperty("did");
      expect(fetchBody).toHaveProperty("public_key");
      expect(fetchBody).toHaveProperty("platform", "ugig.net");
      expect(fetchBody).toHaveProperty("email", "test@example.com");
    });

    it("skips CoinPayPortal registration when no API key", async () => {
      // No COINPAYPORTAL_REPUTATION_API_KEY set
      mockSingle.mockResolvedValue({
        data: { username: "newuser", full_name: null, account_type: "human", did: null },
        error: null,
      });

      await POST(makeRequest(confirmationPayload()));

      // fetch should not be called for DID registration
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining("/api/reputation/did/register"),
        expect.anything()
      );
    });

    it("does not block signup if CoinPayPortal registration fails", async () => {
      process.env.COINPAYPORTAL_API_URL = "https://coinpayportal.com";
      process.env.COINPAYPORTAL_REPUTATION_API_KEY = "test-api-key";
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      mockSingle.mockResolvedValue({
        data: { username: "newuser", full_name: null, account_type: "human", did: null },
        error: null,
      });

      const res = await POST(makeRequest(confirmationPayload()));
      // Still succeeds — CoinPayPortal failure is non-fatal
      expect(res.status).toBe(200);
      expect(mockSendEmail).toHaveBeenCalled();
    });
  });
});
