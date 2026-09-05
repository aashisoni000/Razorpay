import { CandidateObligation } from "../domain/types";

export interface PaymentFeatures {
  id: string;
  amountPaise: bigint;
  orderId?: string;
  invoiceId?: string;
  subscriptionId?: string;
  customerId?: string;
  occurredAt: Date;
}

export interface FeatureVector {
  sameCustomer: number;
  amountRatio: number;
  amountDifferencePaise: number;
  hasOrderId: number;
  hasInvoiceId: number;
  hasSubscriptionId: number;
  referenceMatch: number;
  outstandingRatio: number;
  paymentIsPartial: number;
  paymentIsExact: number;
  paymentIsExcess: number;
  candidateIsOpen: number;
  candidateIsPartiallyRecovered: number;
  numCandidates: number;
}

export const FEATURE_NAMES: (keyof FeatureVector)[] = [
  "sameCustomer",
  "amountRatio",
  "amountDifferencePaise",
  "hasOrderId",
  "hasInvoiceId",
  "hasSubscriptionId",
  "referenceMatch",
  "outstandingRatio",
  "paymentIsPartial",
  "paymentIsExact",
  "paymentIsExcess",
  "candidateIsOpen",
  "candidateIsPartiallyRecovered",
  "numCandidates",
];

export const FEATURE_COUNT = FEATURE_NAMES.length;

export function extractFeatures(
  payment: PaymentFeatures,
  candidate: CandidateObligation,
  totalCandidates: number
): FeatureVector {
  const sameCustomer =
    payment.customerId && candidate.customerId === payment.customerId ? 1 : 0;

  const candidateOutstanding = candidate.outstandingAmountPaise;
  const amountRatio =
    candidateOutstanding > 0n
      ? Number(payment.amountPaise) / Number(candidateOutstanding)
      : 0;

  const amountDiff =
    Number(payment.amountPaise) - Number(candidateOutstanding);

  const hasOrder = payment.orderId ? 1 : 0;
  const hasInvoice = payment.invoiceId ? 1 : 0;
  const hasSub = payment.subscriptionId ? 1 : 0;

  const refMatch =
    payment.orderId && candidate.sourceReference === payment.orderId
      ? 1
      : payment.invoiceId && candidate.sourceReference === payment.invoiceId
        ? 1
        : 0;

  const outstandingRatio =
    candidate.originalAmountPaise > 0n
      ? Number(candidateOutstanding) / Number(candidate.originalAmountPaise)
      : 0;

  const isPartial =
    payment.amountPaise > 0n &&
    payment.amountPaise < candidateOutstanding
      ? 1
      : 0;
  const isExact =
    payment.amountPaise === candidateOutstanding &&
    payment.amountPaise > 0n
      ? 1
      : 0;
  const isExcess = payment.amountPaise > candidateOutstanding ? 1 : 0;

  const isOpen = candidate.status === "OPEN" ? 1 : 0;
  const isPartialStatus =
    candidate.status === "PARTIALLY_RECOVERED" ? 1 : 0;

  return {
    sameCustomer,
    amountRatio: Math.min(amountRatio, 5),
    amountDifferencePaise: Math.min(Math.abs(amountDiff), 10_000_000),
    hasOrderId: hasOrder,
    hasInvoiceId: hasInvoice,
    hasSubscriptionId: hasSub,
    referenceMatch: refMatch,
    outstandingRatio: Math.min(outstandingRatio, 5),
    paymentIsPartial: isPartial,
    paymentIsExact: isExact,
    paymentIsExcess: isExcess,
    candidateIsOpen: isOpen,
    candidateIsPartiallyRecovered: isPartialStatus,
    numCandidates: Math.min(totalCandidates, 10),
  };
}

export function featuresToVector(f: FeatureVector): number[] {
  return FEATURE_NAMES.map((name) => f[name]);
}
