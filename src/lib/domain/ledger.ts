import { LedgerInput, LedgerResult, ObligationStatus } from "./types";

function sumByType(
  events: LedgerInput["paymentEvents"],
  predicate: (type: string) => boolean
): bigint {
  return events
    .filter((e) => predicate(e.type))
    .reduce((sum, e) => sum + e.amountPaise, 0n);
}

function isSuccessfulPayment(type: string): boolean {
  return type === "CAPTURED" || type === "PAYMENT_LINK_EVENT";
}

function isRefund(type: string): boolean {
  return type === "REFUND";
}

function determineStatus(
  originalAmountPaise: bigint,
  recoveredAmountPaise: bigint,
  refundedAmountPaise: bigint,
  outstandingAmountPaise: bigint
): ObligationStatus {
  if (outstandingAmountPaise > 0n) {
    if (recoveredAmountPaise === 0n) return "OPEN";
    return "PARTIALLY_RECOVERED";
  }

  if (recoveredAmountPaise > originalAmountPaise) {
    return "OVERPAID";
  }

  if (recoveredAmountPaise >= originalAmountPaise) {
    if (refundedAmountPaise > 0n) {
      return "PARTIALLY_RECOVERED";
    }
    return "RECOVERED";
  }

  return "OPEN";
}

export function calculateLedger(input: LedgerInput): LedgerResult {
  const { originalAmountPaise, paymentEvents } = input;

  const recoveredAmountPaise = sumByType(paymentEvents, isSuccessfulPayment);
  const refundedAmountPaise = sumByType(paymentEvents, isRefund);

  const netRecovered = recoveredAmountPaise - refundedAmountPaise;

  const outstandingAmountPaise =
    netRecovered < originalAmountPaise
      ? originalAmountPaise - netRecovered
      : 0n;

  const excessAmountPaise =
    recoveredAmountPaise > originalAmountPaise
      ? recoveredAmountPaise - originalAmountPaise
      : 0n;

  const status = determineStatus(
    originalAmountPaise,
    recoveredAmountPaise,
    refundedAmountPaise,
    outstandingAmountPaise
  );

  return {
    originalAmountPaise,
    recoveredAmountPaise,
    refundedAmountPaise,
    outstandingAmountPaise,
    excessAmountPaise,
    status,
  };
}
