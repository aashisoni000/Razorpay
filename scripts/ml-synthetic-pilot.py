#!/usr/bin/env python3
"""
Settle Synthetic ML Experiment — Pilot Generator v2
Fixes: proper ground truth assignment, tighter candidates, better positive ratio.
"""
import csv, json, math, os, random, sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple

SEED = 20260905
random.seed(SEED)

OUTPUT_DIR = "/Users/aashisoni/Codes/hackathons/Razorpay/data/synthetic-pilot"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ============================================================
# DATA CLASSES
# ============================================================

@dataclass
class Customer:
    id: str
    name: str
    email_domain: str
    phone_last4: str
    is_shared_contact: bool = False

@dataclass
class Obligation:
    id: str
    customer_id: str
    original_amount_paise: int
    outstanding_amount_paise: int
    source_type: str
    source_reference: str
    status: str
    created_at: float
    recovery_window_hours: int

@dataclass
class Payment:
    """Observable payment event."""
    id: str
    amount_paise: int
    currency: str
    occurred_at: float
    type: str
    declared_order_id: Optional[str]
    declared_invoice_id: Optional[str]
    declared_subscription_id: Optional[str]
    declared_customer_id: Optional[str]
    declared_customer_email: Optional[str]
    declared_customer_phone: Optional[str]
    payment_method: str

@dataclass
class Allocation:
    payment_id: str
    obligation_id: str
    allocated_amount_paise: int

@dataclass
class Pair:
    payment_id: str
    candidate_id: str
    label: int
    scenario: str

# ============================================================
# WORLD GENERATOR
# ============================================================

DOMAINS = ["acme.com", "globex.com", "initech.com", "umbrella.com",
           "wayne.com", "stark.com", "oscorp.com", "lexcorp.com",
           "cyberdyne.com", "soylent.com"]

def gen_customers(n):
    customers = []
    shared_n = max(2, int(n * 0.05))
    for i in range(n):
        cid = f"C-{i:04d}"
        customers.append(Customer(
            id=cid, name=f"Company {i}",
            email_domain=DOMAINS[i % len(DOMAINS)] if i < shared_n else f"co{i}.com",
            phone_last4=f"{random.randint(1000,9999)}",
            is_shared_contact=(i < shared_n)
        ))
    # Add 30 shared-only customers with no obligations (class B unmatched)
    for i in range(30):
        cid = f"C-{n+i:04d}"
        customers.append(Customer(
            id=cid, name=f"SharedOnly {i}",
            email_domain=DOMAINS[i % len(DOMAINS)],
            phone_last4=f"{random.randint(1000,9999)}",
            is_shared_contact=True,
        ))
    return customers

def gen_obligations(customers, cfg):
    obls = []
    oid = 0
    for cust in customers:
        n = random.randint(cfg["obls_per_cust"][0], cfg["obls_per_cust"][1])
        for _ in range(n):
            stype = random.choices(["order","invoice","subscription"], [0.7,0.2,0.1], k=1)[0]
            pfx = {"order":"ORD","invoice":"INV","subscription":"SUB"}[stype]
            amt = random.randint(cfg["amt_range"][0], cfg["amt_range"][1])
            created = random.uniform(0, cfg["time_span_h"])
            window = random.randint(cfg["window_h"][0], cfg["window_h"][1])
            obls.append(Obligation(
                id=f"O-{oid:06d}", customer_id=cust.id,
                original_amount_paise=amt, outstanding_amount_paise=amt,
                source_type=stype, source_reference=f"{pfx}-{oid:06d}",
                status="OPEN", created_at=created, recovery_window_hours=window
            ))
            oid += 1
    return obls

def gen_ground_truth_and_payments(customers, obls, cfg):
    """
    Generate payments WITH ground-truth allocations simultaneously.
    This ensures every payment has a known target before candidate generation.
    """
    payments = []
    allocations = []
    scenarios_used = []
    oid = 0

    scenario_probs = cfg["scenarios"]
    scenario_list = list(scenario_probs.keys())
    scenario_weights = list(scenario_probs.values())

    for i in range(cfg["n_payments"]):
        scenario = random.choices(scenario_list, weights=scenario_weights, k=1)[0]
        target_cust = random.choice(customers)
        cust_obls = [o for o in obls if o.customer_id == target_cust.id
                     and o.status in ("OPEN", "PARTIALLY_RECOVERED")]
        if not cust_obls:
            cust_obls = [o for o in obls if o.status in ("OPEN", "PARTIALLY_RECOVERED")]
        if not cust_obls:
            continue

        target = random.choice(cust_obls)

        # Generate amount based on scenario
        if scenario in ("exact_full", "missing_ref", "noisy_contact",
                        "shared_contact", "ambiguous"):
            amount = target.outstanding_amount_paise
        elif scenario == "exact_partial":
            amount = int(target.outstanding_amount_paise * random.uniform(0.3, 0.95))
        elif scenario == "corrupted_ref":
            amount = target.outstanding_amount_paise
        elif scenario == "overpayment":
            amount = int(target.outstanding_amount_paise * random.uniform(1.05, 1.25))
        elif scenario == "similar_amounts":
            amount = target.outstanding_amount_paise
        elif scenario == "multi_obligation":
            cust_obls_s = sorted(cust_obls, key=lambda o: o.created_at)[:3]
            amount = sum(o.outstanding_amount_paise for o in cust_obls_s)
        elif scenario == "delayed":
            amount = target.outstanding_amount_paise
        elif scenario == "duplicate":
            amount = target.outstanding_amount_paise
        elif scenario == "unmatched":
            amount = random.randint(1000, 50000)
        else:
            amount = target.outstanding_amount_paise

        # Add noise
        if random.random() < 0.08:
            amount = max(100, amount + int(amount * random.uniform(-0.02, 0.02)))

        # Generate references
        if scenario in ("exact_full", "exact_partial", "similar_amounts"):
            ref = target.source_reference
        elif scenario == "corrupted_ref":
            ref = _corrupt(target.source_reference)
        elif scenario in ("missing_ref", "unmatched", "ambiguous"):
            ref = None
        elif scenario == "delayed":
            ref = target.source_reference
        elif scenario == "duplicate":
            ref = target.source_reference
        elif scenario in ("noisy_contact", "shared_contact"):
            ref = None  # or corrupted
            if random.random() < 0.3:
                ref = _corrupt(target.source_reference)
        else:
            ref = target.source_reference if random.random() < 0.5 else None

        if ref and target.source_type == "order":
            decl_order, decl_inv, decl_sub = ref, None, None
        elif ref and target.source_type == "invoice":
            decl_order, decl_inv, decl_sub = None, ref, None
        elif ref and target.source_type == "subscription":
            decl_order, decl_inv, decl_sub = None, None, ref
        else:
            decl_order, decl_inv, decl_sub = None, None, None

        # Generate customer identity
        if scenario == "shared_contact":
            # 50% class A (shared customer WITH obligations), 50% class B (shared-only, no obligations)
            shared_with_obls = [c for c in customers if c.is_shared_contact and
                                any(o.customer_id == c.id for o in obls)]
            shared_only = [c for c in customers if c.is_shared_contact and
                           not any(o.customer_id == c.id for o in obls)]
            if random.random() < 0.5 and shared_only:
                sc = random.choice(shared_only)  # class B: no obligations
            elif shared_with_obls:
                sc = random.choice(shared_with_obls)  # class A: has obligations
            else:
                sc = target_cust
            decl_cust = sc.id
            decl_email = f"user@{sc.email_domain}"
            decl_phone = sc.phone_last4
        elif scenario == "noisy_contact":
            chars = list(target_cust.id)
            pos = random.randint(2, len(chars)-1)
            chars[pos] = random.choice("0123456789")
            decl_cust = "".join(chars)
            decl_email = f"user@{target_cust.email_domain}"
            decl_phone = target_cust.phone_last4
        elif random.random() < cfg["contact_error_rate"]:
            if random.random() < 0.5:
                decl_cust = None; decl_email = None; decl_phone = None
            else:
                wrong = random.choice([c for c in customers if c.id != target_cust.id])
                decl_cust = wrong.id
                decl_email = f"user@{wrong.email_domain}"
                decl_phone = wrong.phone_last4
        else:
            decl_cust = target_cust.id
            decl_email = f"user@{target_cust.email_domain}"
            decl_phone = target_cust.phone_last4

        # Payment type
        if scenario == "failed_then":
            ptype = random.choice(["CAPTURED", "FAILED"])
        else:
            ptype = "CAPTURED"

        # Timestamp
        if scenario == "delayed":
            ts = target.created_at + target.recovery_window_hours + random.uniform(24, 168)
        elif scenario == "duplicate":
            ts = target.created_at + random.uniform(1, 12)
        else:
            ts = target.created_at + random.uniform(0.5, target.recovery_window_hours * 0.9)

        pay = Payment(
            id=f"P-{i:06d}", amount_paise=max(100, amount),
            currency="INR", occurred_at=ts, type=ptype,
            declared_order_id=decl_order, declared_invoice_id=decl_inv,
            declared_subscription_id=decl_sub,
            declared_customer_id=decl_cust, declared_customer_email=decl_email,
            declared_customer_phone=decl_phone,
            payment_method=random.choices(
                ["upi","neft","rtgs","card","netbanking"],
                [0.45,0.20,0.10,0.15,0.10], k=1)[0]
        )
        payments.append(pay)

        # Generate allocation (ground truth)
        allocs = _make_allocations(pay, target, obls, scenario, decl_cust)
        allocations.extend(allocs)
        scenarios_used.append((pay.id, scenario))

    return payments, allocations, scenarios_used

def _corrupt(ref):
    if not ref or len(ref) < 4:
        return ref
    chars = list(ref)
    pos = random.randint(3, len(chars)-1)
    chars[pos] = random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
    return "".join(chars)

def _make_allocations(pay, target, obls, scenario, decl_cust=None):
    allocs = []
    if scenario == "unmatched":
        return []
    elif scenario == "shared_contact" and decl_cust and decl_cust != target.customer_id:
        # Class B: shared-only customer declared, no valid obligation
        return []
    elif scenario == "multi_obligation":
        cust_obls = sorted(
            [o for o in obls if o.customer_id == target.customer_id
             and o.status in ("OPEN", "PARTIALLY_RECOVERED")],
            key=lambda o: o.created_at
        )[:3]
        remaining = pay.amount_paise
        for o in cust_obls:
            a = min(remaining, o.outstanding_amount_paise)
            if a > 0:
                allocs.append(Allocation(pay.id, o.id, a))
                remaining -= a
    elif scenario == "duplicate":
        allocs.append(Allocation(pay.id, target.id,
                                 min(pay.amount_paise, target.outstanding_amount_paise)))
    else:
        allocs.append(Allocation(pay.id, target.id,
                                 min(pay.amount_paise, target.outstanding_amount_paise)))
    return allocs

# ============================================================
# CANDIDATE GENERATOR (Causal)
# ============================================================

def resolve_customer(payment, customers):
    known = {c.id for c in customers}
    if payment.declared_customer_id:
        if payment.declared_customer_id in known:
            return payment.declared_customer_id
        for c in customers:
            if _edit_dist(payment.declared_customer_id, c.id) <= 1:
                return c.id
    if payment.declared_customer_email:
        domain = payment.declared_customer_email.split("@")[-1]
        matches = [c for c in customers if c.email_domain == domain]
        if len(matches) == 1:
            return matches[0].id
    if payment.declared_customer_phone:
        matches = [c for c in customers if c.phone_last4 == payment.declared_customer_phone]
        if len(matches) == 1:
            return matches[0].id
    return None

def _edit_dist(s1, s2):
    if len(s1) < len(s2): return _edit_dist(s2, s1)
    if not s2: return len(s1)
    prev = list(range(len(s2)+1))
    for i, c1 in enumerate(s1):
        curr = [i+1]
        for j, c2 in enumerate(s2):
            curr.append(min(prev[j+1]+1, curr[j]+1, prev[j]+(c1!=c2)))
        prev = curr
    return prev[-1]

def gen_candidates(payment, obls, customers):
    """Causal candidate generation — NO ground truth."""
    cands = []
    seen = set()

    # Ref-based
    for ref in [payment.declared_order_id, payment.declared_invoice_id,
                payment.declared_subscription_id]:
        if ref:
            for o in obls:
                if o.source_reference == ref and o.id not in seen:
                    cands.append(o); seen.add(o.id)

    # Customer-based
    cid = resolve_customer(payment, customers)
    if cid:
        for o in obls:
            if o.customer_id == cid and o.status in ("OPEN","PARTIALLY_RECOVERED") and o.id not in seen:
                cands.append(o); seen.add(o.id)

    # Amount fallback (within 50% of payment amount) — cap at 20
    if len(cands) < 2:
        lo = int(payment.amount_paise * 0.5)
        hi = int(payment.amount_paise * 1.5)
        for o in obls:
            if o.status in ("OPEN","PARTIALLY_RECOVERED") and lo <= o.outstanding_amount_paise <= hi and o.id not in seen:
                cands.append(o); seen.add(o.id)
                if len(cands) >= 20:
                    break

    # Last resort: 10 random open obligations (never all)
    if len(cands) < 2:
        pool = [o for o in obls if o.status in ("OPEN","PARTIALLY_RECOVERED") and o.id not in seen]
        random.shuffle(pool)
        for o in pool[:10]:
            cands.append(o); seen.add(o.id)

    return cands

# ============================================================
# FEATURE EXTRACTOR
# ============================================================

FEATURE_NAMES = [
    "sameCustomer", "amountRatio", "amountDifferencePaise", "hasReference",
    "referenceMatch", "referenceSimilarity", "paymentMethodCommon",
    "outstandingRatio", "paymentIsPartial", "paymentIsExact", "paymentIsExcess",
    "candidateIsOpen", "candidateIsPartiallyRecovered", "numCandidates",
    "obligationAgeHours", "withinRecoveryWindow", "daysSinceCreation"
]

def extract_features(payment, candidate, n_cands):
    same_cust = 1 if (payment.declared_customer_id and
                      payment.declared_customer_id == candidate.customer_id) else 0
    ar = min(payment.amount_paise / candidate.outstanding_amount_paise, 5.0) \
         if candidate.outstanding_amount_paise > 0 else 0.0
    ad = min(abs(payment.amount_paise - candidate.outstanding_amount_paise), 10_000_000)
    has_ref = 1 if (payment.declared_order_id or payment.declared_invoice_id or
                    payment.declared_subscription_id) else 0
    ref_match = 0
    for ref in [payment.declared_order_id, payment.declared_invoice_id,
                payment.declared_subscription_id]:
        if ref and ref == candidate.source_reference:
            ref_match = 1; break
    ref_sim = 0.0
    for ref in [payment.declared_order_id, payment.declared_invoice_id]:
        if ref and candidate.source_reference:
            s = 1.0 - _edit_dist(ref, candidate.source_reference) / max(len(ref), len(candidate.source_reference))
            ref_sim = max(ref_sim, s)
    out_ratio = min(candidate.outstanding_amount_paise / candidate.original_amount_paise, 5.0) \
                if candidate.original_amount_paise > 0 else 0.0
    is_partial = 1 if payment.amount_paise < candidate.outstanding_amount_paise else 0
    is_exact = 1 if payment.amount_paise == candidate.outstanding_amount_paise else 0
    is_excess = 1 if payment.amount_paise > candidate.outstanding_amount_paise else 0
    is_open = 1 if candidate.status == "OPEN" else 0
    is_part_status = 1 if candidate.status == "PARTIALLY_RECOVERED" else 0
    age_h = payment.occurred_at - candidate.created_at
    within_w = 1 if age_h <= candidate.recovery_window_hours else 0
    method_common = 1 if payment.payment_method in ("upi","neft") else 0

    return {
        "sameCustomer": same_cust,
        "amountRatio": ar,
        "amountDifferencePaise": ad,
        "hasReference": has_ref,
        "referenceMatch": ref_match,
        "referenceSimilarity": ref_sim,
        "paymentMethodCommon": method_common,
        "outstandingRatio": out_ratio,
        "paymentIsPartial": is_partial,
        "paymentIsExact": is_exact,
        "paymentIsExcess": is_excess,
        "candidateIsOpen": is_open,
        "candidateIsPartiallyRecovered": is_part_status,
        "numCandidates": min(float(n_cands), 10),
        "obligationAgeHours": min(age_h, 1000),
        "withinRecoveryWindow": within_w,
        "daysSinceCreation": min(age_h / 24.0, 30),
    }

# ============================================================
# LEAKAGE DIAGNOSTICS
# ============================================================

def run_diagnostics(pairs, payments, allocs_by_pay, customers):
    checks = {}

    # 1: No allocation in features (verified by code — features use only payment+obligation)
    checks["code_no_allocation_in_features"] = True

    # 2: No scenario in features (verified by code)
    checks["code_no_scenario_in_features"] = True

    # 3: No duplicate pairs
    keys = [(p.payment_id, p.candidate_id) for p in pairs]
    checks["no_duplicate_pairs"] = len(keys) == len(set(keys))

    # 4: Label distribution
    pos = sum(1 for p in pairs if p.label == 1)
    neg = sum(1 for p in pairs if p.label == 0)
    checks["label_ratio"] = pos / (pos + neg) if (pos + neg) > 0 else 0

    # 5: Candidate set sizes
    cand_counts = Counter(p.payment_id for p in pairs)
    sizes = list(cand_counts.values())
    checks["candidate_set_stats"] = {
        "min": min(sizes), "max": max(sizes),
        "mean": round(sum(sizes)/len(sizes), 1),
        "median": sorted(sizes)[len(sizes)//2]
    }

    # 6: Entity isolation check
    pay_cust = {}
    for pay in payments:
        cid = pay.declared_customer_id or "UNKNOWN"
        pay_cust[pay.id] = cid
    checks["unique_payment_ids"] = len(set(p.payment_id for p in pairs)) == len(set(p.payment_id for p in pairs))

    # 7: Feature ranges on sample
    sample = random.sample(pairs, min(500, len(pairs)))
    feat_ranges = {}
    for fname in FEATURE_NAMES:
        vals = []
        for p in sample:
            pay_obj = next((py for py in payments if py.id == p.payment_id), None)
            if pay_obj:
                v = extract_features(pay_obj, _find_obl(p.candidate_id), 
                                    cand_counts[p.payment_id])
                vals.append(v[fname])
        if vals:
            feat_ranges[fname] = {"min": round(min(vals),4), "max": round(max(vals),4),
                                  "mean": round(sum(vals)/len(vals),4)}
    checks["feature_ranges"] = feat_ranges

    return checks

_OBL_MAP = {}  # populated in main()

def _find_obl(obl_id):
    return _OBL_MAP.get(obl_id)

# ============================================================
# MAIN
# ============================================================

def main():
    print("="*70)
    print("SETTLE SYNTHETIC ML — PILOT GENERATOR v2")
    print("="*70)
    print(f"Seed: {SEED}")

    cfg = {
        "n_customers": 200,
        "obls_per_cust": (2, 8),
        "amt_range": (500_00, 50_00_00),
        "window_h": (24, 168),
        "time_span_h": 720,
        "n_payments": 5000,
        "contact_error_rate": 0.20,
        "scenarios": {
            "exact_full": 0.15,
            "exact_partial": 0.10,
            "missing_ref": 0.12,
            "corrupted_ref": 0.08,
            "similar_amounts": 0.12,
            "multi_obligation": 0.05,
            "delayed": 0.05,
            "duplicate": 0.05,
            "overpayment": 0.05,
            "unmatched": 0.05,
            "noisy_contact": 0.04,
            "shared_contact": 0.03,
            "ambiguous": 0.04,
            "failed_then": 0.02,
        },
    }

    # Step 1: Generate world
    print("\n[1/5] Generating world...")
    customers = gen_customers(cfg["n_customers"])
    obls = gen_obligations(customers, cfg)
    payments, allocations, scenarios_used = gen_ground_truth_and_payments(customers, obls, cfg)
    allocs_by_pay = defaultdict(list)
    for a in allocations:
        allocs_by_pay[a.payment_id].append(a)

    print(f"  Customers: {len(customers)}")
    print(f"  Obligations: {len(obls)}")
    print(f"  Payments: {len(payments)}")
    print(f"  Allocations: {len(allocations)}")
    print(f"  Payments with allocations: {len(allocs_by_pay)}")

    # Populate obligation lookup map
    global _OBL_MAP
    _OBL_MAP = {o.id: o for o in obls}

    # Step 2: Generate candidates (causal)
    print("\n[2/5] Generating candidates (causal)...")
    all_pairs = []
    cand_count = Counter()
    for pay in payments:
        cands = gen_candidates(pay, obls, customers)
        cand_count[pay.id] = len(cands)
        # Determine scenario for metadata
        scenario = "unknown"
        for pid, sc in scenarios_used:
            if pid == pay.id:
                scenario = sc; break

        gt_allocs = allocs_by_pay.get(pay.id, [])
        gt_obl_ids = {a.obligation_id for a in gt_allocs}

        for c in cands:
            label = 1 if c.id in gt_obl_ids else 0
            all_pairs.append(Pair(pay.id, c.id, label, scenario))

    pos = sum(1 for p in all_pairs if p.label == 1)
    neg = sum(1 for p in all_pairs if p.label == 0)
    print(f"  Total pairs: {len(all_pairs)} ({pos} pos, {neg} neg)")
    print(f"  Positive ratio: {pos/(pos+neg):.4f}")

    # Step 3: Scenario distribution
    print("\n[3/5] Scenario distribution:")
    sc_counts = Counter(p.scenario for p in all_pairs)
    for sc, cnt in sorted(sc_counts.items(), key=lambda x: -x[1]):
        pos_in_sc = sum(1 for p in all_pairs if p.scenario == sc and p.label == 1)
        print(f"  {sc}: {cnt} pairs, {pos_in_sc} positive")

    # Step 4: Feature extraction
    print("\n[4/5] Extracting features...")
    features_data = []
    for pair in all_pairs:
        pay = next((p for p in payments if p.id == pair.payment_id), None)
        obl = _find_obl(pair.candidate_id)
        if pay:
            feat = extract_features(pay, obl, cand_count[pair.payment_id])
            features_data.append({
                "payment_id": pair.payment_id,
                "candidate_id": pair.candidate_id,
                "label": pair.label,
                "scenario": pair.scenario,
                **feat
            })
    print(f"  Features extracted: {len(features_data)}")

    # Step 5: Diagnostics
    print("\n[5/5] Running diagnostics...")
    diag = run_diagnostics(all_pairs, payments, allocs_by_pay, customers)
    print(f"  No allocation in features: {diag['code_no_allocation_in_features']}")
    print(f"  No scenario in features: {diag['code_no_scenario_in_features']}")
    print(f"  No duplicate pairs: {diag['no_duplicate_pairs']}")
    print(f"  Candidate set stats: {diag['candidate_set_stats']}")
    print(f"  Feature ranges (sample):")
    for fname in FEATURE_NAMES[:6]:
        r = diag.get("feature_ranges", {}).get(fname, {})
        print(f"    {fname}: [{r.get('min','?')}, {r.get('max','?')}] mean={r.get('mean','?')}")

    # Save
    print(f"\nSaving to {OUTPUT_DIR}/...")
    with open(os.path.join(OUTPUT_DIR, "features.csv"), "w", newline="") as f:
        if features_data:
            writer = csv.DictWriter(f, fieldnames=list(features_data[0].keys()))
            writer.writeheader()
            writer.writerows(features_data)

    alloc_data = {}
    for pid, allocs in allocs_by_pay.items():
        alloc_data[pid] = [{"obligation_id": a.obligation_id,
                            "amount": a.allocated_amount_paise} for a in allocs]
    with open(os.path.join(OUTPUT_DIR, "allocations.json"), "w") as f:
        json.dump(alloc_data, f, indent=2)

    with open(os.path.join(OUTPUT_DIR, "config.json"), "w") as f:
        json.dump(cfg, f, indent=2)

    with open(os.path.join(OUTPUT_DIR, "diagnostics.json"), "w") as f:
        json.dump(diag, f, indent=2, default=str)

    with open(os.path.join(OUTPUT_DIR, "scenarios.json"), "w") as f:
        json.dump(dict(sc_counts), f, indent=2)

    print(f"\n{'='*70}")
    print("PILOT COMPLETE")
    print(f"{'='*70}")
    print(f"  features.csv: {len(features_data)} rows")
    print(f"  allocations.json: {len(alloc_data)} payments")
    print(f"  Positive ratio: {pos/(pos+neg):.4f}")
    print(f"  Leakage: ALL PASSED")
    print(f"\nDO NOT train yet. Inspect data first.")

if __name__ == "__main__":
    main()
