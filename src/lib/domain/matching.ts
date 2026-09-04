import {
  PaymentEventMatchInput,
  CandidateObligation,
  MatchingResult,
} from "./types";
import { formatPaise } from "../utils/money";

function extractReferences(
  event: PaymentEventMatchInput
): { key: string; value: string }[] {
  const refs: { key: string; value: string }[] = [];
  if (event.orderId) refs.push({ key: "order_id", value: event.orderId });
  if (event.invoiceId)
    refs.push({ key: "invoice_id", value: event.invoiceId });
  if (event.subscriptionId)
    refs.push({ key: "subscription_id", value: event.subscriptionId });
  return refs;
}

function findStrongMatch(
  event: PaymentEventMatchInput,
  candidates: CandidateObligation[]
): CandidateObligation | null {
  const refs = extractReferences(event);
  if (refs.length === 0) return null;

  for (const ref of refs) {
    for (const candidate of candidates) {
      if (candidate.sourceReference === ref.value) {
        return candidate;
      }
    }
  }
  return null;
}

function findModerateMatches(
  event: PaymentEventMatchInput,
  candidates: CandidateObligation[]
): CandidateObligation[] {
  return candidates.filter((c) => {
    if (event.amountPaise <= 0n) return false;
    if (event.customerId && c.customerId !== event.customerId) return false;
    if (c.outstandingAmountPaise <= 0n) return false;
    if (c.status === "RECOVERED") return false;
    if (event.amountPaise <= c.outstandingAmountPaise) return true;
    return false;
  });
}

export function matchPaymentToObligation(
  event: PaymentEventMatchInput,
  candidateObligations: CandidateObligation[],
  recoveryWindowExpiry?: Date
): MatchingResult {
  const activeCandidates = candidateObligations.filter(
    (c) => c.status !== "STOPPED"
  );

  if (activeCandidates.length === 0) {
    return {
      obligationId: null,
      evidenceTier: "INSUFFICIENT_EVIDENCE",
      evidence: ["No active obligations found for this customer"],
      reasonCode: "no_candidates",
      candidates: [],
    };
  }

  const strongMatch = findStrongMatch(event, activeCandidates);
  if (strongMatch) {
    const refs = extractReferences(event);
    const matchedRef = refs.find(
      (r) => r.value === strongMatch.sourceReference
    );
    return {
      obligationId: strongMatch.id,
      evidenceTier: "STRONG_EVIDENCE",
      evidence: [
        `${matchedRef!.key} ${matchedRef!.value} exactly matches obligation ${strongMatch.id}`,
      ],
      reasonCode: "strong_reference_match",
      candidates: [strongMatch.id],
    };
  }

  const refs = extractReferences(event);
  if (refs.length > 0) {
    const notFoundEvidence = refs.map(
      (r) => `${r.key} ${r.value} does not match any obligation source_reference`
    );
    return {
      obligationId: null,
      evidenceTier: "INSUFFICIENT_EVIDENCE",
      evidence: notFoundEvidence,
      reasonCode: "reference_not_found",
      candidates: activeCandidates.map((c) => c.id),
    };
  }

  if (recoveryWindowExpiry && event.occurredAt > recoveryWindowExpiry) {
    return {
      obligationId: null,
      evidenceTier: "INSUFFICIENT_EVIDENCE",
      evidence: ["Event occurred outside the recovery window"],
      reasonCode: "outside_recovery_window",
      candidates: activeCandidates.map((c) => c.id),
    };
  }

  const moderateMatches = findModerateMatches(event, activeCandidates);

  if (moderateMatches.length === 1) {
    const match = moderateMatches[0];
    const evidence: string[] = [];
    if (event.customerId) evidence.push("Customer matches");
    evidence.push(
      `${formatPaise(event.amountPaise)} payment is within ${formatPaise(match.outstandingAmountPaise)} outstanding`
    );
    if (recoveryWindowExpiry) {
      evidence.push("Event occurred within recovery window");
    }
    return {
      obligationId: match.id,
      evidenceTier: "MODERATE_EVIDENCE",
      evidence,
      reasonCode: "single_moderate_match",
      candidates: [match.id],
    };
  }

  if (moderateMatches.length > 1) {
    return {
      obligationId: null,
      evidenceTier: "INSUFFICIENT_EVIDENCE",
      evidence: [
        `${moderateMatches.length} candidate obligations match on customer and amount`,
        "No reliable reference to disambiguate",
      ],
      reasonCode: "multiple_candidates",
      candidates: moderateMatches.map((c) => c.id),
    };
  }

  return {
    obligationId: null,
    evidenceTier: "INSUFFICIENT_EVIDENCE",
    evidence: [
      "No obligation matches on customer, amount, or reference",
    ],
    reasonCode: "no_match",
    candidates: activeCandidates.map((c) => c.id),
  };
}
