import { RazorpayConfig, CreatePaymentLinkRequest, RazorpayPaymentLink } from "./types";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Check your .env configuration.`
    );
  }
  return value;
}

export function getConfig(): RazorpayConfig {
  return {
    keyId: getRequiredEnv("RAZORPAY_KEY_ID"),
    keySecret: getRequiredEnv("RAZORPAY_KEY_SECRET"),
    webhookSecret: getRequiredEnv("RAZORPAY_WEBHOOK_SECRET"),
  };
}

function authHeader(config: RazorpayConfig): string {
  const token = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");
  return `Basic ${token}`;
}

export async function createPaymentLink(
  config: RazorpayConfig,
  request: CreatePaymentLinkRequest
): Promise<RazorpayPaymentLink> {
  const body = {
    amount: request.amountPaise,
    currency: request.currency,
    reference_id: request.referenceId,
    description: request.description,
    customer: request.customer,
    notify: request.notify ?? { email: true, sms: true },
    callback_url: request.callbackUrl,
    callback_method: request.callbackMethod ?? "get",
  };

  const response = await fetch(`${RAZORPAY_API_BASE}/payment_links`, {
    method: "POST",
    headers: {
      Authorization: authHeader(config),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Razorpay API error: ${response.status} ${response.statusText} — ${errorBody}`
    );
  }

  return response.json() as Promise<RazorpayPaymentLink>;
}
