import { DecisionInput, DecisionResult } from "./types";
import { formatPaise } from "../utils/money";

function sortByDesc(dates: Date[]): Date[] {
  return [...dates].sort((a, b) => b.getTime() - a.getTime());
}

export function decide(input: DecisionInput): DecisionResult {
  const {
    obligation,
    policy,
    activeActions,
    recentActionTimestamps,
    hasUnresolvedAssociation,
    now,
    paymentCount,
  } = input;

  if (obligation.outstandingAmountPaise === 0n) {
    const evidence: string[] = ["Outstanding balance is ₹0"];
    if (paymentCount > 0) {
      evidence.push(
        `The obligation has been settled across ${paymentCount} payment(s)`
      );
    }
    if (activeActions.length > 0) {
      evidence.push("Active recovery action should be cancelled");
    }
    return {
      decision: "STOP",
      reasonCode: "outstanding_zero",
      evidence,
    };
  }

  if (hasUnresolvedAssociation) {
    return {
      decision: "ESCALATE",
      reasonCode: "unresolved_association",
      evidence: [
        "Payment could not be safely associated with an obligation",
        "Multiple candidate obligations exist",
      ],
    };
  }

  if (activeActions.length > 0) {
    return {
      decision: "WAIT",
      reasonCode: "action_in_flight",
      evidence: [
        `${formatPaise(obligation.outstandingAmountPaise)} remains outstanding`,
        "A recovery action is already active",
      ],
    };
  }

  if (paymentCount >= policy.maxAttempts) {
    return {
      decision: "STOP",
      reasonCode: "max_attempts_reached",
      evidence: [
        `${formatPaise(obligation.outstandingAmountPaise)} remains outstanding`,
        `${paymentCount} recovery attempt(s) have been made`,
        `Policy maximum of ${policy.maxAttempts} attempts reached`,
      ],
    };
  }

  const sortedTimestamps = sortByDesc(recentActionTimestamps);
  if (sortedTimestamps.length > 0) {
    const lastActionTime = sortedTimestamps[0].getTime();
    const cooldownEnd =
      lastActionTime + policy.cooldownBetweenAttemptsHours * 60 * 60 * 1000;
    const nowMs = now.getTime();
    if (nowMs < cooldownEnd) {
      const remainingMs = cooldownEnd - nowMs;
      const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
      return {
        decision: "WAIT",
        reasonCode: "cooldown_active",
        evidence: [
          `${formatPaise(obligation.outstandingAmountPaise)} remains outstanding`,
          `Cooldown active for ${remainingHours} more hour(s)`,
        ],
      };
    }
  }

  return {
    decision: "ACT",
    reasonCode: "outstanding_and_policy_allows",
    evidence: [
      `${formatPaise(obligation.outstandingAmountPaise)} remains outstanding`,
      "No active recovery action exists",
      "Recovery window is active",
      "Policy allows payment-link recovery",
    ],
  };
}
