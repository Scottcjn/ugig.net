import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";

describe("lib/coinpay-client", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.COINPAY_API_KEY = "cp_test_key";
    process.env.COINPAY_MERCHANT_ID = "biz-uuid";
    process.env.APP_URL = "https://ugig.net";
    vi.resetModules();
    fetchSpy = vi.spyOn(globalThis, "fetch") as never;
  });

  afterEach(() => {
    process.env = originalEnv;
    fetchSpy.mockRestore();
  });

  describe("verifyCoinpayWebhook", () => {
    it("verifies a valid HMAC signature", async () => {
      const { verifyCoinpayWebhook } = await import("@/lib/coinpay-client");
      const secret = "whsecret_test";
      const body = JSON.stringify({ id: "evt_1", type: "payment.confirmed" });
      const ts = Math.floor(Date.now() / 1000).toString();
      const sig = crypto
        .createHmac("sha256", secret)
        .update(`${ts}.${body}`)
        .digest("hex");
      expect(verifyCoinpayWebhook(body, `t=${ts},v1=${sig}`, secret)).toBe(
        true
      );
    });

    it("rejects a tampered body", async () => {
      const { verifyCoinpayWebhook } = await import("@/lib/coinpay-client");
      const secret = "whsecret_test";
      const body = JSON.stringify({ id: "evt_1", type: "payment.confirmed" });
      const ts = Math.floor(Date.now() / 1000).toString();
      const sig = crypto
        .createHmac("sha256", secret)
        .update(`${ts}.${body}`)
        .digest("hex");
      expect(
        verifyCoinpayWebhook('{"tampered":true}', `t=${ts},v1=${sig}`, secret)
      ).toBe(false);
    });

    it("rejects a stale timestamp", async () => {
      const { verifyCoinpayWebhook } = await import("@/lib/coinpay-client");
      const secret = "whsecret_test";
      const body = "{}";
      const ts = (Math.floor(Date.now() / 1000) - 600).toString();
      const sig = crypto
        .createHmac("sha256", secret)
        .update(`${ts}.${body}`)
        .digest("hex");
      expect(verifyCoinpayWebhook(body, `t=${ts},v1=${sig}`, secret)).toBe(
        false
      );
    });

    it("rejects missing signature header", async () => {
      const { verifyCoinpayWebhook } = await import("@/lib/coinpay-client");
      expect(verifyCoinpayWebhook("{}", null, "secret")).toBe(false);
    });

    it("rejects malformed header", async () => {
      const { verifyCoinpayWebhook } = await import("@/lib/coinpay-client");
      expect(verifyCoinpayWebhook("{}", "garbage", "secret")).toBe(false);
    });
  });

  describe("createCoinpayPayment payload shape", () => {
    function mockCp(extra: Record<string, unknown> = {}) {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          payment: {
            id: "pay_123",
            payment_address: "0xabc",
            amount_crypto: 1.234,
            currency: "usdc_pol",
            expires_at: "2030-01-01T00:00:00Z",
            ...extra,
          },
        }),
        text: async () => "",
      } as unknown as Response;
    }

    it("crypto: payment_method=crypto, chosen currency, unified webhook URL", async () => {
      fetchSpy.mockResolvedValueOnce(mockCp());
      const { createCoinpayPayment } = await import("@/lib/coinpay-client");
      await createCoinpayPayment({ amount_usd: 5, currency: "sol" });

      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.payment_method).toBe("crypto");
      expect(body.currency).toBe("sol");
      expect(body.business_id).toBe("biz-uuid");
      expect(body.webhook_url).toBe("https://ugig.net/api/webhooks/coinpay");
      expect(body.success_url).toBe("https://ugig.net/funding?payment=success");
      expect(body.cancel_url).toBe(
        "https://ugig.net/funding?payment=cancelled"
      );
    });

    it("card: payment_method=both with usdc_pol fallback and unified webhook URL", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockCp({ stripe_checkout_url: "https://checkout.stripe.com/abc" })
      );
      const { createCoinpayPayment } = await import("@/lib/coinpay-client");
      await createCoinpayPayment({ amount_usd: 25, currency: "card" });

      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.payment_method).toBe("both");
      expect(body.currency).toBe("usdc_pol");
      expect(body.webhook_url).toBe("https://ugig.net/api/webhooks/coinpay");
      expect(body.success_url).toBe("https://ugig.net/funding?payment=success");
      expect(body.cancel_url).toBe(
        "https://ugig.net/funding?payment=cancelled"
      );
    });

    it("throws on non-2xx response with body in error", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({}),
        text: async () => '{"error":"bad merchant"}',
      } as unknown as Response);
      const { createCoinpayPayment } = await import("@/lib/coinpay-client");
      await expect(
        createCoinpayPayment({ amount_usd: 1, currency: "sol" })
      ).rejects.toThrow(/CoinPay create failed 400.*bad merchant/);
    });
  });
});
