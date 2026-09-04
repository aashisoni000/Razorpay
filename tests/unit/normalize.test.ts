import { describe, it, expect } from "vitest";
import { normalizeWebhookEvent } from "@/lib/razorpay/normalize";
import { RazorpayWebhookEvent } from "@/lib/razorpay/types";

function makeEvent(overrides: Partial<RazorpayWebhookEvent>): RazorpayWebhookEvent {
  return {
    entity: "event",
    id: "evt_test_001",
    account_id: "acc_test",
    event: "payment_link.paid",
    created_at: 1700000000,
    payload: {
      payment_link: {
        entity: {
          id: "plink_test_001",
          entity: "payment_link",
          amount: 100000,
          currency: "INR",
          status: "paid",
          reference_id: "ORD-001",
          short_url: "https://rzp.io/i/test",
          created_at: 1700000000,
        },
      },
      payment: {
        entity: {
          id: "pay_test_001",
          entity: "payment",
          amount: 100000,
          currency: "INR",
          status: "captured",
          order_id: "ORD-001",
          customer_id: "cust_001",
          created_at: 1700000000,
        },
      },
    },
    ...overrides,
  };
}

describe("normalizeWebhookEvent", () => {
  it("returns null when payment_link entity is missing", () => {
    const event = makeEvent({
      payload: { payment_link: undefined as never },
    });

    expect(normalizeWebhookEvent(event)).toBeNull();
  });

  it("maps payment_link.paid to CAPTURED", () => {
    const event = makeEvent({ event: "payment_link.paid" });
    const result = normalizeWebhookEvent(event);

    expect(result).not.toBeNull();
    expect(result!.type).toBe("CAPTURED");
  });

  it("maps payment_link.expired to FAILED", () => {
    const event = makeEvent({
      event: "payment_link.expired",
      payload: {
        payment_link: {
          entity: {
            id: "plink_001",
            entity: "payment_link",
            amount: 50000,
            currency: "INR",
            status: "expired",
            reference_id: "ORD-002",
            short_url: "https://rzp.io/i/test2",
            created_at: 1700000000,
          },
        },
      },
    });
    const result = normalizeWebhookEvent(event);

    expect(result).not.toBeNull();
    expect(result!.type).toBe("FAILED");
  });

  it("maps payment_link.created to CREATED", () => {
    const event = makeEvent({
      event: "payment_link.created",
      payload: {
        payment_link: {
          entity: {
            id: "plink_001",
            entity: "payment_link",
            amount: 50000,
            currency: "INR",
            status: "created",
            reference_id: "ORD-002",
            short_url: "https://rzp.io/i/test2",
            created_at: 1700000000,
          },
        },
      },
    });
    const result = normalizeWebhookEvent(event);

    expect(result).not.toBeNull();
    expect(result!.type).toBe("CREATED");
  });

  it("extracts orderId from payment entity", () => {
    const event = makeEvent({});
    const result = normalizeWebhookEvent(event);

    expect(result).not.toBeNull();
    expect(result!.orderId).toBe("ORD-001");
  });

  it("extracts customerId from payment entity", () => {
    const event = makeEvent({});
    const result = normalizeWebhookEvent(event);

    expect(result).not.toBeNull();
    expect(result!.customerId).toBe("cust_001");
  });

  it("uses payment amount when available", () => {
    const event = makeEvent({});
    const result = normalizeWebhookEvent(event);

    expect(result).not.toBeNull();
    expect(result!.amountPaise).toBe(100000);
  });

  it("uses payment_link amount when payment entity is absent", () => {
    const event = makeEvent({
      payload: {
        payment_link: {
          entity: {
            id: "plink_001",
            entity: "payment_link",
            amount: 75000,
            currency: "INR",
            status: "paid",
            reference_id: "ORD-003",
            short_url: "https://rzp.io/i/test3",
            created_at: 1700000000,
          },
        },
      },
    });
    const result = normalizeWebhookEvent(event);

    expect(result).not.toBeNull();
    expect(result!.amountPaise).toBe(75000);
  });

  it("includes raw payload for audit trail", () => {
    const event = makeEvent({});
    const result = normalizeWebhookEvent(event);

    expect(result).not.toBeNull();
    expect(result!.rawPayload).toBeDefined();
    expect(result!.rawPayload.entity).toBe("event");
  });

  it("preserves externalEventId from Razorpay event id", () => {
    const event = makeEvent({ id: "evt_unique_123" });
    const result = normalizeWebhookEvent(event);

    expect(result).not.toBeNull();
    expect(result!.externalEventId).toBe("evt_unique_123");
  });
});
