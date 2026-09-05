import {
  extractFeatures,
  featuresToVector,
  PaymentFeatures,
  FEATURE_NAMES,
} from "./features";
import { CandidateObligation, ObligationStatus } from "../domain/types";

export interface DatasetRow {
  features: number[];
  label: 0 | 1;
  paymentId: string;
  candidateId: string;
  source: string;
}

export interface LabeledExample {
  payment: PaymentFeatures;
  candidate: CandidateObligation;
  label: 0 | 1;
  source: string;
}

function makeCandidate(
  id: string,
  customerId: string,
  amount: bigint,
  outstanding: bigint,
  status: ObligationStatus = "OPEN",
  ref?: string
): CandidateObligation {
  return {
    id,
    sourceReference: ref,
    customerId,
    outstandingAmountPaise: outstanding,
    status,
    originalAmountPaise: amount,
  };
}

function makePayment(
  id: string,
  amount: bigint,
  customerId: string,
  orderId?: string,
  hoursOffset: number = 0
): PaymentFeatures {
  return {
    id,
    amountPaise: amount,
    orderId,
    customerId,
    occurredAt: new Date(Date.now() + hoursOffset * 3600_000),
  };
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function addJitter(
  payment: PaymentFeatures,
  amountJitterPct: number,
  rand: () => number
): PaymentFeatures {
  const jitter = 1 + (rand() - 0.5) * 2 * amountJitterPct;
  return {
    ...payment,
    amountPaise: BigInt(Math.round(Number(payment.amountPaise) * jitter)),
  };
}

function buildRow(
  payment: PaymentFeatures,
  candidate: CandidateObligation,
  label: 0 | 1,
  source: string,
  allCandidates: CandidateObligation[]
): DatasetRow {
  const fv = extractFeatures(payment, candidate, allCandidates.length);
  return {
    features: featuresToVector(fv),
    label,
    paymentId: payment.id,
    candidateId: candidate.id,
    source,
  };
}

export function generateDataset(seed: number = 42): DatasetRow[] {
  const rand = seededRandom(seed);
  const examples: LabeledExample[] = [];

  const c1 = makeCandidate("ob-1", "cust-1", 1000000n, 1000000n, "OPEN", "ORD-1001");
  const c2 = makeCandidate("ob-2", "cust-1", 800000n, 800000n, "OPEN", "ORD-1002");
  const c3 = makeCandidate("ob-3", "cust-2", 1000000n, 1000000n, "OPEN", "ORD-2001");
  const c4 = makeCandidate("ob-4", "cust-2", 500000n, 500000n, "OPEN", "ORD-2002");
  const c5 = makeCandidate("ob-5", "cust-3", 1200000n, 1200000n, "OPEN", "ORD-3001");
  const c6 = makeCandidate("ob-6", "cust-1", 1000000n, 350000n, "PARTIALLY_RECOVERED", "ORD-1003");
  const c7 = makeCandidate("ob-7", "cust-4", 750000n, 750000n, "OPEN", "ORD-4001");
  const c8 = makeCandidate("ob-8", "cust-4", 750000n, 0n, "RECOVERED", "ORD-4002");
  const c9 = makeCandidate("ob-9", "cust-5", 2000000n, 2000000n, "OPEN", "ORD-5001");
  const c10 = makeCandidate("ob-10", "cust-5", 500000n, 500000n, "OPEN", "ORD-5002");

  const allCust1 = [c1, c2, c6];
  const allCust2 = [c3, c4];
  const allCust3 = [c5];
  const allCust4 = [c7, c8];
  const allCust5 = [c9, c10];

  // POSITIVE: Exact reference match
  examples.push({
    payment: makePayment("pos-ref-1", 1000000n, "cust-1", "ORD-1001"),
    candidate: c1,
    label: 1,
    source: "exact_ref_match",
  });

  // POSITIVE: Exact amount match, single candidate
  examples.push({
    payment: makePayment("pos-amt-1", 1000000n, "cust-2", undefined),
    candidate: c3,
    label: 1,
    source: "exact_amount_single_candidate",
  });

  // POSITIVE: Partial payment, single candidate
  examples.push({
    payment: makePayment("pos-partial-1", 600000n, "cust-1", "ORD-1001"),
    candidate: c1,
    label: 1,
    source: "partial_payment_single_candidate",
  });

  // POSITIVE: Partial payment on partially recovered
  examples.push({
    payment: makePayment("pos-partial-2", 350000n, "cust-1", undefined),
    candidate: c6,
    label: 1,
    source: "partial_on_partially_recovered",
  });

  // NEGATIVE: Different customer
  examples.push({
    payment: makePayment("neg-cust-1", 1000000n, "cust-2", undefined),
    candidate: c1,
    label: 0,
    source: "different_customer",
  });

  // NEGATIVE: Amount way off
  examples.push({
    payment: makePayment("neg-amt-1", 100000n, "cust-1", undefined),
    candidate: c1,
    label: 0,
    source: "amount_too_low",
  });

  // NEGATIVE: Wrong reference
  examples.push({
    payment: makePayment("neg-ref-1", 800000n, "cust-1", "WRONG-REF"),
    candidate: c1,
    label: 0,
    source: "wrong_reference",
  });

  // NEGATIVE: Recovered obligation
  examples.push({
    payment: makePayment("neg-recov-1", 750000n, "cust-4", undefined),
    candidate: c8,
    label: 0,
    source: "recovered_obligation",
  });

  // Generate scenario-based examples
  // Scenario: cust-1 has c1 (10k, open), c2 (8k, open), c6 (10k, 3.5k outstanding)
  for (let i = 0; i < 20; i++) {
    const amt = BigInt(Math.round(500000 + rand() * 500000));
    const pay = makePayment(`sc-cust1-${i}`, amt, "cust-1", undefined, i);
    const isMatch = amt <= c1.outstandingAmountPaise;
    examples.push({
      payment: pay,
      candidate: c1,
      label: isMatch ? 1 : 0,
      source: "scenario_cust1_c1",
    });
    examples.push({
      payment: pay,
      candidate: c2,
      label: 0,
      source: "scenario_cust1_c2",
    });
    examples.push({
      payment: pay,
      candidate: c6,
      label: 0,
      source: "scenario_cust1_c6",
    });
  }

  // Scenario: cust-2 has c3 (10k), c4 (5k)
  for (let i = 0; i < 20; i++) {
    const amt = BigInt(Math.round(300000 + rand() * 700000));
    const pay = makePayment(`sc-cust2-${i}`, amt, "cust-2", undefined, i);
    const isC3 = amt <= c3.outstandingAmountPaise && amt > c4.outstandingAmountPaise;
    const isC4 = amt <= c4.outstandingAmountPaise;
    examples.push({
      payment: pay,
      candidate: c3,
      label: isC3 ? 1 : 0,
      source: "scenario_cust2_c3",
    });
    examples.push({
      payment: pay,
      candidate: c4,
      label: isC4 && !isC3 ? 1 : 0,
      source: "scenario_cust2_c4",
    });
  }

  // Scenario: cust-5 has c9 (20k), c10 (5k) - big gap
  for (let i = 0; i < 20; i++) {
    const amt = BigInt(Math.round(100000 + rand() * 1900000));
    const pay = makePayment(`sc-cust5-${i}`, amt, "cust-5", undefined, i);
    examples.push({
      payment: pay,
      candidate: c9,
      label: amt <= c9.outstandingAmountPaise && amt > c10.outstandingAmountPaise ? 1 : 0,
      source: "scenario_cust5_c9",
    });
    examples.push({
      payment: pay,
      candidate: c10,
      label: amt <= c10.outstandingAmountPaise && amt > c9.outstandingAmountPaise ? 0 : 0,
      source: "scenario_cust5_c10",
    });
  }

  // Scenario: cust-4 has c7 (7.5k, open), c8 (7.5k, recovered)
  for (let i = 0; i < 15; i++) {
    const amt = BigInt(Math.round(200000 + rand() * 600000));
    const pay = makePayment(`sc-cust4-${i}`, amt, "cust-4", undefined, i);
    examples.push({
      payment: pay,
      candidate: c7,
      label: amt <= c7.outstandingAmountPaise ? 1 : 0,
      source: "scenario_cust4_c7",
    });
    examples.push({
      payment: pay,
      candidate: c8,
      label: 0,
      source: "scenario_cust4_c8_recovered",
    });
  }

  // Jitter variations of positive examples
  const positives = examples.filter((e) => e.label === 1);
  for (let i = 0; i < 30; i++) {
    const base = positives[i % positives.length];
    const jitteredPay = addJitter(base.payment, 0.15, rand);
    examples.push({
      payment: jitteredPay,
      candidate: base.candidate,
      label: 1,
      source: `jitter_pos_${i}`,
    });
  }

  // Jitter variations of negative examples
  const negatives = examples.filter((e) => e.label === 0);
  for (let i = 0; i < 30; i++) {
    const base = negatives[i % negatives.length];
    const jitteredPay = addJitter(base.payment, 0.15, rand);
    examples.push({
      payment: jitteredPay,
      candidate: base.candidate,
      label: 0,
      source: `jitter_neg_${i}`,
    });
  }

  // Cross-customer negatives (payments meant for one customer, candidate is another)
  for (let i = 0; i < 10; i++) {
    const amt = BigInt(Math.round(500000 + rand() * 500000));
    const pay = makePayment(`cross-${i}`, amt, "cust-1", undefined, i);
    examples.push({
      payment: pay,
      candidate: c3,
      label: 0,
      source: "cross_customer",
    });
  }

  // Build dataset rows
  const rows: DatasetRow[] = examples.map((ex) => {
    const allCandidates = ex.payment.customerId === "cust-1"
      ? allCust1
      : ex.payment.customerId === "cust-2"
        ? allCust2
        : ex.payment.customerId === "cust-3"
          ? allCust3
          : ex.payment.customerId === "cust-4"
            ? allCust4
            : allCust5;
    return buildRow(ex.payment, ex.candidate, ex.label, ex.source, allCandidates);
  });

  return rows;
}

export function splitDataset(
  rows: DatasetRow[],
  trainRatio: number = 0.8,
  seed: number = 42
): { train: DatasetRow[]; test: DatasetRow[] } {
  const rand = seededRandom(seed);
  const shuffled = [...rows].sort(() => rand() - 0.5);
  const splitIdx = Math.floor(shuffled.length * trainRatio);
  return {
    train: shuffled.slice(0, splitIdx),
    test: shuffled.slice(splitIdx),
  };
}

export function getFeatureNames(): string[] {
  return [...FEATURE_NAMES];
}
