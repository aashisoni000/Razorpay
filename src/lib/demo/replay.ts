import { calculateLedger } from "../domain/ledger";
import { matchPaymentToObligation } from "../domain/matching";
import { decide } from "../domain/decision";
import { createPolicy } from "../domain/policies";
import {
  LedgerResult,
  DecisionResult,
  MatchingResult,
  PaymentEventInput,
  CandidateObligation,
  ObligationStatus,
} from "../domain/types";
import {
  Scenario,
  ScenarioObligation,
} from "./scenarios";

export interface ReplayEventResult {
  eventId: string;
  matchResult: MatchingResult;
  ledger: LedgerResult;
  decision: DecisionResult;
}

export interface ReplayResult {
  scenarioId: string;
  eventsProcessed: number;
  duplicateEventsSkipped: number;
  eventResults: ReplayEventResult[];
  finalLedger: LedgerResult;
  finalDecision: DecisionResult;
  exceptionsCreated: number;
  linkedEventIds: string[];
}

function toCandidate(o: ScenarioObligation): CandidateObligation {
  return {
    id: o.id,
    sourceReference: o.sourceReference,
    customerId: o.customerId,
    outstandingAmountPaise: o.originalAmountPaise,
    status: "OPEN",
  };
}

export function replayScenario(scenario: Scenario): ReplayResult {
  const policy = createPolicy({
    maxAttempts: scenario.maxAttempts ?? 3,
    recoveryWindowHours: scenario.recoveryWindowHours ?? 72,
  });

  const obligationState = new Map<
    string,
    {
      obligation: ScenarioObligation;
      events: PaymentEventInput[];
      status: ObligationStatus;
    }
  >();

  for (const ob of scenario.obligations) {
    obligationState.set(ob.id, {
      obligation: ob,
      events: [],
      status: "OPEN",
    });
  }

  const processedEventIds = new Set<string>();
  const eventResults: ReplayEventResult[] = [];
  let exceptionsCreated = 0;
  let duplicateEventsSkipped = 0;

  for (const event of scenario.events) {
    if (processedEventIds.has(event.id)) {
      duplicateEventsSkipped++;
      continue;
    }

    const candidates = scenario.obligations.map((ob) => {
      const state = obligationState.get(ob.id)!;
      const recovered = state.events
        .filter((e) => e.type === "CAPTURED" || e.type === "PAYMENT_LINK_EVENT")
        .reduce((sum, e) => sum + e.amountPaise, 0n);
      return {
        ...toCandidate(ob),
        outstandingAmountPaise: ob.originalAmountPaise - recovered,
        status: state.status,
      };
    });

    const matchResult = matchPaymentToObligation(
      {
        id: event.id,
        amountPaise: event.amountPaise,
        orderId: event.orderId,
        invoiceId: event.invoiceId,
        subscriptionId: event.subscriptionId,
        customerId: event.customerId,
        occurredAt: event.occurredAt,
      },
      candidates
    );

    if (matchResult.evidenceTier === "INSUFFICIENT_EVIDENCE") {
      exceptionsCreated++;
      eventResults.push({
        eventId: event.id,
        matchResult,
        ledger: calculateLedger({
          originalAmountPaise: 0n,
          paymentEvents: [],
        }),
        decision: {
          decision: "ESCALATE",
          reasonCode: "unresolved_association",
          evidence: matchResult.evidence,
        },
      });
      processedEventIds.add(event.id);
      continue;
    }

    const targetObligationId = matchResult.obligationId!;
    const state = obligationState.get(targetObligationId)!;

    const ledgerEvent: PaymentEventInput = {
      id: event.id,
      type: event.type,
      amountPaise: event.amountPaise,
    };
    state.events.push(ledgerEvent);

    const ledger = calculateLedger({
      originalAmountPaise: state.obligation.originalAmountPaise,
      paymentEvents: state.events,
    });

    state.status = ledger.status;

    const decision = decide({
      obligation: {
        id: targetObligationId,
        outstandingAmountPaise: ledger.outstandingAmountPaise,
        status: ledger.status,
      },
      policy,
      activeActions: [],
      recentActionTimestamps: [],
      hasUnresolvedAssociation: false,
      now: event.occurredAt,
      paymentCount: state.events.length,
    });

    eventResults.push({
      eventId: event.id,
      matchResult,
      ledger,
      decision,
    });

    processedEventIds.add(event.id);
  }

  const primaryObligation = obligationState.get(
    scenario.expectedFinalObligationId
  );
  const finalLedger = primaryObligation
    ? calculateLedger({
        originalAmountPaise: primaryObligation.obligation.originalAmountPaise,
        paymentEvents: primaryObligation.events,
      })
    : calculateLedger({ originalAmountPaise: 0n, paymentEvents: [] });

  const finalDecision = decide({
    obligation: {
      id: scenario.expectedFinalObligationId,
      outstandingAmountPaise: finalLedger.outstandingAmountPaise,
      status: finalLedger.status,
    },
    policy,
    activeActions: [],
    recentActionTimestamps: [],
    hasUnresolvedAssociation: exceptionsCreated > 0,
    now: NOW,
    paymentCount: primaryObligation?.events.length ?? 0,
  });

  return {
    scenarioId: scenario.id,
    eventsProcessed: processedEventIds.size,
    duplicateEventsSkipped,
    eventResults,
    finalLedger,
    finalDecision,
    exceptionsCreated,
    linkedEventIds: eventResults
      .filter((r) => r.matchResult.obligationId !== null)
      .map((r) => r.eventId),
  };
}

const NOW = new Date("2025-01-15T12:00:00Z");

export function printReplayResult(result: ReplayResult): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Scenario: ${result.scenarioId}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Events processed: ${result.eventsProcessed}`);
  console.log(`Duplicate events skipped: ${result.duplicateEventsSkipped}`);
  console.log(`Exceptions created: ${result.exceptionsCreated}`);
  console.log(`\nFinal Ledger:`);
  console.log(`  Original:     ₹${(Number(result.finalLedger.originalAmountPaise) / 100).toLocaleString("en-IN")}`);
  console.log(`  Recovered:    ₹${(Number(result.finalLedger.recoveredAmountPaise) / 100).toLocaleString("en-IN")}`);
  console.log(`  Refunded:     ₹${(Number(result.finalLedger.refundedAmountPaise) / 100).toLocaleString("en-IN")}`);
  console.log(`  Outstanding:  ₹${(Number(result.finalLedger.outstandingAmountPaise) / 100).toLocaleString("en-IN")}`);
  console.log(`  Excess:       ₹${(Number(result.finalLedger.excessAmountPaise) / 100).toLocaleString("en-IN")}`);
  console.log(`  Status:       ${result.finalLedger.status}`);
  console.log(`\nDecision: ${result.finalDecision.decision}`);
  console.log(`Reason:   ${result.finalDecision.reasonCode}`);
  console.log(`Evidence:`);
  for (const e of result.finalDecision.evidence) {
    console.log(`  ✓ ${e}`);
  }
  console.log("");
}
