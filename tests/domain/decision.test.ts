import { describe, it, expect } from "vitest";
import { decide } from "@/lib/domain/decision";
import { DecisionInput } from "@/lib/domain/types";

const now = new Date("2025-01-15T12:00:00Z");

function makeInput(
  overrides: Partial<DecisionInput> = {}
): DecisionInput {
  return {
    obligation: {
      id: "ob-1",
      outstandingAmountPaise: 350000n,
      status: "PARTIALLY_RECOVERED",
    },
    policy: {
      maxAttempts: 3,
      recoveryWindowHours: 72,
      cooldownBetweenAttemptsHours: 24,
    },
    activeActions: [],
    recentActionTimestamps: [],
    hasUnresolvedAssociation: false,
    now,
    paymentCount: 1,
    ...overrides,
  };
}

describe("decide", () => {
  describe("STOP - outstanding_zero", () => {
    it("stops when outstanding is zero", () => {
      const result = decide(
        makeInput({
          obligation: {
            id: "ob-1",
            outstandingAmountPaise: 0n,
            status: "RECOVERED",
          },
          paymentCount: 2,
        })
      );
      expect(result.decision).toBe("STOP");
      expect(result.reasonCode).toBe("outstanding_zero");
      expect(result.evidence[0]).toContain("₹0");
    });

    it("stops when outstanding is zero even with active actions", () => {
      const result = decide(
        makeInput({
          obligation: {
            id: "ob-1",
            outstandingAmountPaise: 0n,
            status: "RECOVERED",
          },
          activeActions: [{ id: "act-1", createdAt: now }],
          paymentCount: 2,
        })
      );
      expect(result.decision).toBe("STOP");
      expect(result.reasonCode).toBe("outstanding_zero");
      expect(result.evidence.some((e) => e.includes("cancel"))).toBe(true);
    });

    it("stops when outstanding is zero even with max attempts reached", () => {
      const result = decide(
        makeInput({
          obligation: {
            id: "ob-1",
            outstandingAmountPaise: 0n,
            status: "RECOVERED",
          },
          paymentCount: 5,
        })
      );
      expect(result.decision).toBe("STOP");
      expect(result.reasonCode).toBe("outstanding_zero");
    });
  });

  describe("ESCALATE - unresolved_association", () => {
    it("escalates when unresolved association", () => {
      const result = decide(
        makeInput({ hasUnresolvedAssociation: true })
      );
      expect(result.decision).toBe("ESCALATE");
      expect(result.reasonCode).toBe("unresolved_association");
      expect(result.evidence.some((e) => e.includes("Multiple"))).toBe(true);
    });
  });

  describe("WAIT - action_in_flight", () => {
    it("waits when active action exists", () => {
      const result = decide(
        makeInput({
          activeActions: [{ id: "act-1", createdAt: now }],
        })
      );
      expect(result.decision).toBe("WAIT");
      expect(result.reasonCode).toBe("action_in_flight");
      expect(result.evidence.some((e) => e.includes("active"))).toBe(true);
    });
  });

  describe("STOP - max_attempts_reached", () => {
    it("stops when max attempts reached", () => {
      const result = decide(
        makeInput({
          paymentCount: 3,
          policy: {
            maxAttempts: 3,
            recoveryWindowHours: 72,
            cooldownBetweenAttemptsHours: 24,
          },
        })
      );
      expect(result.decision).toBe("STOP");
      expect(result.reasonCode).toBe("max_attempts_reached");
      expect(result.evidence.some((e) => e.includes("3"))).toBe(true);
    });
  });

  describe("WAIT - cooldown_active", () => {
    it("waits during cooldown period", () => {
      const result = decide(
        makeInput({
          recentActionTimestamps: [
            new Date("2025-01-15T01:00:00Z"),
          ],
          policy: {
            maxAttempts: 3,
            recoveryWindowHours: 72,
            cooldownBetweenAttemptsHours: 24,
          },
          now: new Date("2025-01-15T12:00:00Z"),
        })
      );
      expect(result.decision).toBe("WAIT");
      expect(result.reasonCode).toBe("cooldown_active");
      expect(result.evidence.some((e) => e.includes("Cooldown"))).toBe(true);
    });

    it("does not wait after cooldown expires", () => {
      const result = decide(
        makeInput({
          recentActionTimestamps: [
            new Date("2025-01-13T01:00:00Z"),
          ],
          policy: {
            maxAttempts: 3,
            recoveryWindowHours: 72,
            cooldownBetweenAttemptsHours: 24,
          },
          now: new Date("2025-01-15T12:00:00Z"),
        })
      );
      expect(result.decision).toBe("ACT");
    });
  });

  describe("ACT", () => {
    it("acts when all conditions are met", () => {
      const result = decide(makeInput());
      expect(result.decision).toBe("ACT");
      expect(result.reasonCode).toBe("outstanding_and_policy_allows");
      expect(result.evidence.some((e) => e.includes("outstanding"))).toBe(true);
      expect(result.evidence.some((e) => e.includes("No active"))).toBe(true);
    });
  });

  describe("priority ordering", () => {
    it("outstanding_zero wins over active action", () => {
      const result = decide(
        makeInput({
          obligation: {
            id: "ob-1",
            outstandingAmountPaise: 0n,
            status: "RECOVERED",
          },
          activeActions: [{ id: "act-1", createdAt: now }],
          paymentCount: 2,
        })
      );
      expect(result.decision).toBe("STOP");
      expect(result.reasonCode).toBe("outstanding_zero");
    });

    it("outstanding_zero wins over unresolved association", () => {
      const result = decide(
        makeInput({
          obligation: {
            id: "ob-1",
            outstandingAmountPaise: 0n,
            status: "RECOVERED",
          },
          hasUnresolvedAssociation: true,
          paymentCount: 2,
        })
      );
      expect(result.decision).toBe("STOP");
      expect(result.reasonCode).toBe("outstanding_zero");
    });

    it("unresolved wins over active action", () => {
      const result = decide(
        makeInput({
          hasUnresolvedAssociation: true,
          activeActions: [{ id: "act-1", createdAt: now }],
        })
      );
      expect(result.decision).toBe("ESCALATE");
      expect(result.reasonCode).toBe("unresolved_association");
    });

    it("active action wins over max attempts", () => {
      const result = decide(
        makeInput({
          activeActions: [{ id: "act-1", createdAt: now }],
          paymentCount: 3,
          policy: {
            maxAttempts: 3,
            recoveryWindowHours: 72,
            cooldownBetweenAttemptsHours: 24,
          },
        })
      );
      expect(result.decision).toBe("WAIT");
      expect(result.reasonCode).toBe("action_in_flight");
    });

    it("max attempts wins over cooldown", () => {
      const result = decide(
        makeInput({
          paymentCount: 3,
          recentActionTimestamps: [new Date("2025-01-14T12:00:00Z")],
          policy: {
            maxAttempts: 3,
            recoveryWindowHours: 72,
            cooldownBetweenAttemptsHours: 24,
          },
        })
      );
      expect(result.decision).toBe("STOP");
      expect(result.reasonCode).toBe("max_attempts_reached");
    });

    it("cooldown wins over ACT", () => {
      const result = decide(
        makeInput({
          recentActionTimestamps: [new Date("2025-01-15T01:00:00Z")],
          policy: {
            maxAttempts: 3,
            recoveryWindowHours: 72,
            cooldownBetweenAttemptsHours: 24,
          },
          now: new Date("2025-01-15T12:00:00Z"),
        })
      );
      expect(result.decision).toBe("WAIT");
      expect(result.reasonCode).toBe("cooldown_active");
    });
  });
});
