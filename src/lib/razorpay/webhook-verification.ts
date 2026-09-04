import { createHmac, timingSafeEqual } from "crypto";
import { RazorpayConfig } from "./types";

export function verifyWebhookSignature(
  config: RazorpayConfig,
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false;

  const expectedSignature = createHmac("sha256", config.webhookSecret)
    .update(rawBody)
    .digest("hex");

  const sigBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(sigBuffer, expectedBuffer);
}
