import { z } from "zod";

export const ProcessEventInputSchema = z.object({
  externalEventId: z.string().min(1),
  type: z.enum([
    "CREATED",
    "AUTHORIZED",
    "CAPTURED",
    "FAILED",
    "PARTIAL",
    "REFUND",
    "DUPLICATE",
    "RETRY",
    "PAYMENT_LINK_EVENT",
  ]),
  amountPaise: z.bigint().nonnegative(),
  source: z.string().min(1),
  orderId: z.string().optional(),
  invoiceId: z.string().optional(),
  subscriptionId: z.string().optional(),
  customerId: z.string().optional(),
  occurredAt: z.date(),
  rawPayload: z.record(z.string(), z.unknown()).optional(),
});

export type ValidatedProcessEventInput = z.infer<typeof ProcessEventInputSchema>;

export const ExceptionInputSchema = z.object({
  obligationId: z.string().optional(),
  type: z.enum([
    "AMBIGUOUS_ASSOCIATION",
    "MISSING_REFERENCE",
    "CONFLICTING_EVENTS",
    "OVERPAYMENT",
    "UNRESOLVED_ASSOCIATION",
    "MANUAL_REVIEW_REQUIRED",
  ]),
  description: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type ValidatedExceptionInput = z.infer<typeof ExceptionInputSchema>;
