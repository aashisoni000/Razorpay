export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export interface CreatePaymentLinkRequest {
  amountPaise: number;
  currency: string;
  referenceId: string;
  description: string;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notify?: {
    email?: boolean;
    sms?: boolean;
    whatsapp?: boolean;
  };
  callbackUrl?: string;
  callbackMethod?: "get" | "post";
}

export interface RazorpayPaymentLink {
  id: string;
  entity: "payment_link";
  amount: number;
  currency: string;
  status: "created" | "partial" | "paid" | "expired" | "cancelled";
  reference_id: string;
  short_url: string;
  created_at: number;
}

export interface RazorpayWebhookEvent {
  entity: "event";
  id: string;
  account_id: string;
  event: string;
  created_at: number;
  payload: {
    payment_link: {
      entity: RazorpayPaymentLink;
    };
    payment?: {
      entity: {
        id: string;
        entity: "payment";
        amount: number;
        currency: string;
        status:
          | "created"
          | "authorized"
          | "captured"
          | "refunded"
          | "failed"
          | "pending";
        order_id?: string;
        invoice_id?: string;
        customer_id?: string;
        method?: string;
        created_at: number;
      };
    };
  };
}

export interface NormalizedPaymentEvent {
  externalEventId: string;
  type: "CREATED" | "CAPTURED" | "FAILED" | "REFUND" | "AUTHORIZED";
  amountPaise: number;
  source: string;
  orderId?: string;
  invoiceId?: string;
  customerId?: string;
  occurredAt: Date;
  rawPayload: Record<string, unknown>;
}
