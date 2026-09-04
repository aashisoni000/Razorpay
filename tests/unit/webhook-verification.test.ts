import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyWebhookSignature } from "@/lib/razorpay/webhook-verification";
import { RazorpayConfig } from "@/lib/razorpay/types";

const testConfig: RazorpayConfig = {
  keyId: "rzp_test_key",
  keySecret: "test_secret",
  webhookSecret: "test_webhook_secret",
};

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("webhook signature verification", () => {
  it("accepts a valid signature", () => {
    const body = '{"event":"payment_link.paid"}';
    const signature = sign(body, testConfig.webhookSecret);

    expect(verifyWebhookSignature(testConfig, body, signature)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const body = '{"event":"payment_link.paid"}';

    expect(
      verifyWebhookSignature(testConfig, body, "invalid_signature_hex")
    ).toBe(false);
  });

  it("rejects null signature header", () => {
    const body = '{"event":"payment_link.paid"}';

    expect(verifyWebhookSignature(testConfig, body, null)).toBe(false);
  });

  it("rejects empty signature header", () => {
    const body = '{"event":"payment_link.paid"}';

    expect(verifyWebhookSignature(testConfig, body, "")).toBe(false);
  });

  it("rejects body tampering", () => {
    const body = '{"event":"payment_link.paid"}';
    const signature = sign(body, testConfig.webhookSecret);
    const tamperedBody = '{"event":"payment_link.created"}';

    expect(verifyWebhookSignature(testConfig, tamperedBody, signature)).toBe(
      false
    );
  });

  it("rejects signature from wrong secret", () => {
    const body = '{"event":"payment_link.paid"}';
    const signature = sign(body, "wrong_secret");

    expect(verifyWebhookSignature(testConfig, body, signature)).toBe(false);
  });

  it("handles empty body correctly", () => {
    const body = "";
    const signature = sign(body, testConfig.webhookSecret);

    expect(verifyWebhookSignature(testConfig, body, signature)).toBe(true);
  });

  it("handles large payload correctly", () => {
    const body = JSON.stringify({
      event: "payment_link.paid",
      payload: { data: "x".repeat(10000) },
    });
    const signature = sign(body, testConfig.webhookSecret);

    expect(verifyWebhookSignature(testConfig, body, signature)).toBe(true);
  });
});
