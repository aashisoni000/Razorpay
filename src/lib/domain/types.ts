export type ObligationStatus =
  | "OPEN"
  | "PARTIALLY_RECOVERED"
  | "RECOVERED"
  | "OVERPAID"
  | "STOPPED"
  | "ESCALATED";

export type PaymentEventType =
  | "CREATED"
  | "AUTHORIZED"
  | "CAPTURED"
  | "FAILED"
  | "PARTIAL"
  | "REFUND"
  | "DUPLICATE"
  | "RETRY"
  | "PAYMENT_LINK_EVENT";

export type RecoveryActionStatus =
  | "CREATED"
  | "ACTIVE"
  | "SUCCEEDED"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED";

export type ExceptionType =
  | "AMBIGUOUS_ASSOCIATION"
  | "MISSING_REFERENCE"
  | "CONFLICTING_EVENTS"
  | "OVERPAYMENT"
  | "UNRESOLVED_ASSOCIATION"
  | "MANUAL_REVIEW_REQUIRED";

export type ExceptionStatus = "OPEN" | "RESOLVED" | "DISMISSED";

export type Decision = "ACT" | "WAIT" | "STOP" | "ESCALATE";

export type EvidenceTier =
  | "STRONG_EVIDENCE"
  | "MODERATE_EVIDENCE"
  | "INSUFFICIENT_EVIDENCE";

// ---- Ledger ----

export interface LedgerInput {
  originalAmountPaise: bigint;
  paymentEvents: PaymentEventInput[];
}

export interface PaymentEventInput {
  id: string;
  type: PaymentEventType;
  amountPaise: bigint;
}

export interface LedgerResult {
  originalAmountPaise: bigint;
  recoveredAmountPaise: bigint;
  refundedAmountPaise: bigint;
  outstandingAmountPaise: bigint;
  excessAmountPaise: bigint;
  status: ObligationStatus;
}

// ---- Matching ----

export interface PaymentEventMatchInput {
  id: string;
  amountPaise: bigint;
  orderId?: string;
  invoiceId?: string;
  subscriptionId?: string;
  customerId?: string;
  occurredAt: Date;
}

export interface CandidateObligation {
  id: string;
  sourceReference?: string;
  customerId: string;
  outstandingAmountPaise: bigint;
  originalAmountPaise: bigint;
  status: ObligationStatus;
}

export interface MatchingResult {
  obligationId: string | null;
  evidenceTier: EvidenceTier;
  evidence: string[];
  reasonCode: string;
  candidates: string[];
}

// ---- Decision ----

export interface DecisionInput {
  obligation: {
    id: string;
    outstandingAmountPaise: bigint;
    status: ObligationStatus;
  };
  policy: RecoveryPolicy;
  activeActions: ActiveRecoveryAction[];
  recentActionTimestamps: Date[];
  hasUnresolvedAssociation: boolean;
  now: Date;
  paymentCount: number;
}

export interface ActiveRecoveryAction {
  id: string;
  createdAt: Date;
}

export interface RecoveryPolicy {
  maxAttempts: number;
  recoveryWindowHours: number;
  cooldownBetweenAttemptsHours: number;
}

export interface DecisionResult {
  decision: Decision;
  reasonCode: string;
  evidence: string[];
}

// ---- Audit ----

export interface AuditSnapshot {
  stateBefore: Record<string, unknown>;
  stateAfter: Record<string, unknown>;
  decision: DecisionResult;
  actor: string;
}
