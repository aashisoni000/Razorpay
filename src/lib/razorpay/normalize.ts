import { RazorpayWebhookEvent, NormalizedPaymentEvent } from "./types";

export function normalizeWebhookEvent(
  event: RazorpayWebhookEvent
): NormalizedPaymentEvent | null {
  const paymentLink = event.payload?.payment_link?.entity;
  if (!paymentLink) return null;

  const payment = event.payload?.payment?.entity;

  const base: NormalizedPaymentEvent = {
    externalEventId: event.id,
    type: mapEventType(event.event, payment?.status),
    amountPaise: payment?.amount ?? paymentLink.amount,
    source: "razorpay",
    orderId: payment?.order_id ?? undefined,
    invoiceId: payment?.invoice_id ?? undefined,
    customerId: payment?.customer_id ?? undefined,
    occurredAt: new Date((payment?.created_at ?? paymentLink.created_at) * 1000),
    rawPayload: event as unknown as Record<string, unknown>,
  };

  return base;
}

function mapEventType(
  razorpayEvent: string,
  paymentStatus?: string
): NormalizedPaymentEvent["type"] {
  if (paymentStatus === "captured") return "CAPTURED";
  if (paymentStatus === "failed") return "FAILED";
  if (paymentStatus === "authorized") return "AUTHORIZED";
  if (paymentStatus === "refunded") return "REFUND";

  if (razorpayEvent === "payment_link.paid") return "CAPTURED";
  if (razorpayEvent === "payment_link.expired") return "FAILED";
  if (razorpayEvent === "payment_link.cancelled") return "FAILED";
  if (razorpayEvent === "payment_link.created") return "CREATED";

  return "CREATED";
}
