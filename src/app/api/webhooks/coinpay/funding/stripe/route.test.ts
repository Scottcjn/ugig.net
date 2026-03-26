import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

// Mock Supabase
const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => mockSupabase,
}));

import { POST } from "./route";

const TEST_SECRET = "whsec_test_secret_key_12345";

function makeSignature(payload: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const sig = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${ts},v1=${sig}`;
}

function makeEvent(type: string, data: Record<string, any> = {}) {
  return {
    id: "evt_test_123",
    type,
    data: { object: data },
    created: Math.floor(Date.now() / 1000),
  };
}

function makeRequest(body: string, signature: string): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/coinpay/funding/stripe", {
    method: "POST",
    headers: {
      "stripe-signature": signature,
      "content-type": "application/json",
    },
    body,
  });
}

// Chainable mock helper
function chainResult(result: { data: any; error: any }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ["select", "eq", "single", "insert", "update", "delete"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(result);
  chain.insert = vi.fn().mockResolvedValue(result);
  chain.update = vi.fn().mockReturnValue(chain);
  return chain;
}

describe("POST /api/webhooks/coinpay/funding/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COINPAY_STRIPE_WEBHOOK_SECRET = TEST_SECRET;
  });

  it("returns 400 without stripe-signature header", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/coinpay/funding/stripe", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 with invalid signature", async () => {
    const body = JSON.stringify(makeEvent("payment_intent.succeeded"));
    const req = makeRequest(body, "t=123,v1=invalidsig");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 with expired timestamp", async () => {
    const body = JSON.stringify(makeEvent("payment_intent.succeeded"));
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 min ago
    const sig = makeSignature(body, TEST_SECRET, oldTimestamp);
    const req = makeRequest(body, sig);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("handles payment_intent.succeeded", async () => {
    const event = makeEvent("payment_intent.succeeded", {
      id: "pi_test_123",
      amount: 1000, // $10
      metadata: { user_id: "user-1", amount_usd: "10" },
    });
    const body = JSON.stringify(event);
    const sig = makeSignature(body, TEST_SECRET);

    // Mock: no existing payment
    const fundingChain = chainResult({ data: null, error: { code: "PGRST116" } });
    const insertChain = chainResult({ data: null, error: null });
    const profileChain = chainResult({ data: { credits: 5000 }, error: null });
    const updateChain = chainResult({ data: null, error: null });
    const notifChain = chainResult({ data: null, error: null });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "funding_payments") {
        callCount++;
        if (callCount === 1) return fundingChain; // lookup
        return insertChain; // insert
      }
      if (table === "profiles") {
        callCount++;
        if (callCount <= 4) return profileChain; // select
        return updateChain; // update
      }
      if (table === "notifications") return notifChain;
      return chainResult({ data: null, error: null });
    });

    const req = makeRequest(body, sig);
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
  });

  it("handles charge.succeeded", async () => {
    const event = makeEvent("charge.succeeded", {
      id: "ch_test_456",
      amount: 2500,
      payment_intent: "pi_test_456",
      metadata: { user_id: "user-2", amount_usd: "25" },
    });
    const body = JSON.stringify(event);
    const sig = makeSignature(body, TEST_SECRET);

    const chain = chainResult({ data: null, error: { code: "PGRST116" } });
    mockFrom.mockReturnValue(chain);

    const req = makeRequest(body, sig);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("handles charge.refunded", async () => {
    const event = makeEvent("charge.refunded", {
      id: "ch_test_789",
      payment_intent: "pi_test_789",
    });
    const body = JSON.stringify(event);
    const sig = makeSignature(body, TEST_SECRET);

    const paymentChain = chainResult({
      data: { id: "fp-1", user_id: "user-3", amount_usd: "10" },
      error: null,
    });
    const updateChain = chainResult({ data: null, error: null });
    const profileChain = chainResult({ data: { credits: 15000 }, error: null });
    const notifChain = chainResult({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "funding_payments") return paymentChain;
      if (table === "profiles") return profileChain;
      if (table === "notifications") return notifChain;
      return updateChain;
    });

    const req = makeRequest(body, sig);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("ignores unhandled event types", async () => {
    const event = makeEvent("customer.created", { id: "cus_123" });
    const body = JSON.stringify(event);
    const sig = makeSignature(body, TEST_SECRET);

    const req = makeRequest(body, sig);
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
  });

  it("returns 500 when webhook secret not configured", async () => {
    delete process.env.COINPAY_STRIPE_WEBHOOK_SECRET;
    const body = JSON.stringify(makeEvent("payment_intent.succeeded"));
    const req = makeRequest(body, "t=123,v1=abc");
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("skips already-processed payments (idempotent)", async () => {
    const event = makeEvent("payment_intent.succeeded", {
      id: "pi_already",
      amount: 500,
      metadata: { user_id: "user-1" },
    });
    const body = JSON.stringify(event);
    const sig = makeSignature(body, TEST_SECRET);

    // Return existing paid payment
    const chain = chainResult({ data: { id: "fp-1", status: "paid" }, error: null });
    mockFrom.mockReturnValue(chain);

    const req = makeRequest(body, sig);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
