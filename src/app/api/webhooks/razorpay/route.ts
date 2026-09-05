import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/razorpay/client";
import { verifyWebhookSignature } from "@/lib/razorpay/webhook-verification";
import { normalizeWebhookEvent } from "@/lib/razorpay/normalize";
import { processPaymentEvent } from "@/lib/services/payment-event-service";
import { RazorpayWebhookEvent } from "@/lib/razorpay/types";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("X-Razorpay-Signature");

  let config;
  try {
    config = getConfig();
  } catch {
    return NextResponse.json(
      { error: "Webhook configuration missing" },
      { status: 500 }
    );
  }

  if (!verifyWebhookSignature(config, rawBody, signatureHeader)) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const normalized = normalizeWebhookEvent(event);
  if (!normalized) {
    return NextResponse.json({ status: "ignored" }, { status: 200 });
  }

  try {
    await processPaymentEvent(prisma, {
      externalEventId: normalized.externalEventId,
      type: normalized.type,
      amountPaise: BigInt(normalized.amountPaise),
      source: normalized.source,
      orderId: normalized.orderId,
      invoiceId: normalized.invoiceId,
      customerId: normalized.customerId,
      occurredAt: normalized.occurredAt,
      rawPayload: normalized.rawPayload,
    });
  } catch (err) {
    console.error("[webhook] Processing error:", {
      eventType: normalized.type,
      externalEventId: normalized.externalEventId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
