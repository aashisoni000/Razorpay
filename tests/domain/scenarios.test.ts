import { describe, it, expect } from "vitest";
import { scenarios } from "@/lib/demo/scenarios";
import { replayScenario, ReplayResult } from "@/lib/demo/replay";

function expectLedgerMatch(
  result: ReplayResult,
  expected: {
    recoveredAmountPaise: bigint;
    refundedAmountPaise: bigint;
    outstandingAmountPaise: bigint;
    excessAmountPaise: bigint;
    status: string;
  }
) {
  expect(result.finalLedger.recoveredAmountPaise).toBe(
    expected.recoveredAmountPaise
  );
  expect(result.finalLedger.refundedAmountPaise).toBe(
    expected.refundedAmountPaise
  );
  expect(result.finalLedger.outstandingAmountPaise).toBe(
    expected.outstandingAmountPaise
  );
  expect(result.finalLedger.excessAmountPaise).toBe(expected.excessAmountPaise);
  expect(result.finalLedger.status).toBe(expected.status);
}

function expectDecisionMatch(
  result: ReplayResult,
  expected: { decision: string; reasonCode: string }
) {
  expect(result.finalDecision.decision).toBe(expected.decision);
  expect(result.finalDecision.reasonCode).toBe(expected.reasonCode);
}

describe("scenario replay", () => {
  for (const scenario of scenarios) {
    describe(scenario.id, () => {
      it(scenario.name, () => {
        const result = replayScenario(scenario);

        expect(result.scenarioId).toBe(scenario.id);
        expect(result.exceptionsCreated).toBe(
          scenario.expectedException ? 1 : 0
        );
        expectLedgerMatch(result, scenario.expectedLedger);
        expectDecisionMatch(result, scenario.expectedDecision);

        if (scenario.expectedLinkedEvents.length > 0) {
          expect(result.linkedEventIds).toEqual(
            expect.arrayContaining(scenario.expectedLinkedEvents)
          );
        }
      });
    });
  }

  describe("flagship scenario detail", () => {
    it("failed payment does not count toward recovery", () => {
      const scenario = scenarios.find(
        (s) => s.id === "flagship_alternate_payments"
      )!;
      const result = replayScenario(scenario);

      expect(result.eventsProcessed).toBe(3);
      expect(result.finalLedger.recoveredAmountPaise).toBe(1000000n);
      expect(result.finalLedger.outstandingAmountPaise).toBe(0n);
      expect(result.finalDecision.decision).toBe("STOP");
      expect(result.finalDecision.reasonCode).toBe("outstanding_zero");

      const failedEvent = result.eventResults.find(
        (r) => r.eventId === "evt-flag-1"
      );
      expect(failedEvent).toBeDefined();
    });
  });

  describe("duplicate event idempotency", () => {
    it("processes duplicate event only once", () => {
      const scenario = scenarios.find((s) => s.id === "duplicate_event")!;
      const result = replayScenario(scenario);

      expect(result.eventsProcessed).toBe(1);
      expect(result.duplicateEventsSkipped).toBe(1);
      expect(result.finalLedger.recoveredAmountPaise).toBe(500000n);
    });
  });

  describe("overpayment never auto-refunds", () => {
    it("flags excess but does not reduce outstanding below zero", () => {
      const scenario = scenarios.find((s) => s.id === "overpayment")!;
      const result = replayScenario(scenario);

      expect(result.finalLedger.outstandingAmountPaise).toBe(0n);
      expect(result.finalLedger.excessAmountPaise).toBe(200000n);
      expect(result.finalLedger.status).toBe("OVERPAID");
    });
  });

  describe("refund reopens obligation", () => {
    it("full payment followed by refund reopens obligation via orderId", () => {
      const scenario = scenarios.find(
        (s) => s.id === "refund_after_recovery"
      )!;
      const result = replayScenario(scenario);

      expect(result.finalLedger.recoveredAmountPaise).toBe(1000000n);
      expect(result.finalLedger.refundedAmountPaise).toBe(200000n);
      expect(result.finalLedger.outstandingAmountPaise).toBe(200000n);
      expect(result.finalLedger.status).toBe("PARTIALLY_RECOVERED");
      expect(result.exceptionsCreated).toBe(0);
      expect(result.linkedEventIds).toContain("evt-refund-2");
    });
  });

  describe("ambiguous payment creates exception", () => {
    it("no obligation balance changes for unresolved payment", () => {
      const scenario = scenarios.find((s) => s.id === "ambiguous_payment")!;
      const result = replayScenario(scenario);

      expect(result.exceptionsCreated).toBe(1);
      const obA = scenario.obligations.find((o) => o.id === "ob-amb-a")!;
      expect(result.finalLedger.recoveredAmountPaise).toBe(0n);
      expect(result.finalLedger.outstandingAmountPaise).toBe(
        obA.originalAmountPaise
      );
    });
  });

  describe("out-of-order events", () => {
    it("refund before payment does not corrupt ledger", () => {
      const scenario = scenarios.find((s) => s.id === "out_of_order_events")!;
      const result = replayScenario(scenario);

      expect(result.finalLedger.recoveredAmountPaise).toBe(1000000n);
      expect(result.finalLedger.refundedAmountPaise).toBe(200000n);
      expect(result.finalLedger.outstandingAmountPaise).toBe(200000n);
    });
  });
});
