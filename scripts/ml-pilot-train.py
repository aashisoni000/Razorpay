#!/usr/bin/env python3
"""
Settle Synthetic ML — Pilot Training & Evaluation
Trains logistic regression on 15 features (excluding deterministic duplicates).
Evaluates using Set safety objective: maximize coverage subject to precision ≥ 0.95.
"""
import csv, json, math, os, random, sys
from collections import defaultdict
from typing import List, Dict, Tuple

SEED = 20260905
random.seed(SEED)

DATA_DIR = "/Users/aashisoni/Codes/hackathons/Razorpay/data/synthetic-pilot"
OUTPUT_DIR = "/Users/aashisoni/Codes/hackathons/Razorpay/data/synthetic-pilot/results"

# Features to use (excluding deterministic duplicates: referenceMatch, paymentIsExact)
FEATURE_NAMES = [
    "sameCustomer", "amountRatio", "amountDifferencePaise", "hasReference",
    "referenceSimilarity", "paymentMethodCommon",
    "outstandingRatio", "paymentIsPartial", "paymentIsExcess",
    "candidateIsOpen", "candidateIsPartiallyRecovered", "numCandidates",
    "obligationAgeHours", "withinRecoveryWindow", "daysSinceCreation"
]

def load_data():
    """Load features.csv, allocations.json, and config.json."""
    features = []
    with open(os.path.join(DATA_DIR, "features.csv")) as f:
        reader = csv.DictReader(f)
        for row in reader:
            features.append(row)

    with open(os.path.join(DATA_DIR, "allocations.json")) as f:
        allocations = json.load(f)

    with open(os.path.join(DATA_DIR, "config.json")) as f:
        config = json.load(f)

    return features, allocations, config

def normalize(X):
    """Z-score normalization. Returns normalized X, means, stds."""
    n_features = len(X[0])
    means = [0.0] * n_features
    stds = [1.0] * n_features

    for j in range(n_features):
        vals = [X[i][j] for i in range(len(X))]
        means[j] = sum(vals) / len(vals)
        var = sum((v - means[j]) ** 2 for v in vals) / len(vals)
        stds[j] = max(math.sqrt(var), 1e-8)

    X_norm = []
    for i in range(len(X)):
        X_norm.append([(X[i][j] - means[j]) / stds[j] for j in range(n_features)])

    return X_norm, means, stds

def sigmoid(z):
    if z >= 0:
        return 1.0 / (1.0 + math.exp(-z))
    else:
        ez = math.exp(z)
        return ez / (1.0 + ez)

def train_lr(X, y, lr=0.1, epochs=200):
    """Train logistic regression with gradient descent."""
    n = len(X)
    d = len(X[0])
    w = [0.0] * d
    b = 0.0

    for epoch in range(epochs):
        grad_w = [0.0] * d
        grad_b = 0.0
        total_loss = 0.0

        for i in range(n):
            z = sum(w[j] * X[i][j] for j in range(d)) + b
            p = sigmoid(z)
            err = p - y[i]
            total_loss += -y[i] * math.log(max(p, 1e-10)) - (1 - y[i]) * math.log(max(1 - p, 1e-10))

            for j in range(d):
                grad_w[j] += err * X[i][j]
            grad_b += err

        for j in range(d):
            w[j] -= lr * grad_w[j] / n
        b -= lr * grad_b / n

        if (epoch + 1) % 50 == 0:
            print(f"  Epoch {epoch+1}: loss={total_loss/n:.4f}")

    return w, b

def predict(X, w, b):
    """Return list of probabilities."""
    return [sigmoid(sum(w[j] * x[j] for j in range(len(w))) + b) for x in X]

def evaluate(y_true, y_prob, threshold):
    """Evaluate at a given threshold. Returns precision, recall, coverage, n_accepted."""
    tp = fp = fn = tn = 0
    for t, p in zip(y_true, y_prob):
        pred = 1 if p >= threshold else 0
        if pred == 1 and t == 1: tp += 1
        elif pred == 1 and t == 0: fp += 1
        elif pred == 0 and t == 1: fn += 1
        else: tn += 1

    n_accepted = tp + fp
    n_total = len(y_true)
    precision = tp / n_accepted if n_accepted > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    coverage = n_accepted / n_total if n_total > 0 else 0.0

    return {
        "threshold": threshold,
        "precision": precision,
        "recall": recall,
        "coverage": coverage,
        "n_accepted": n_accepted,
        "tp": tp, "fp": fp, "fn": fn, "tn": tn
    }

def find_optimal_threshold(y_true, y_prob, precision_floor=0.95):
    """Find threshold that maximizes coverage subject to precision ≥ floor."""
    thresholds = sorted(set(y_prob), reverse=True)
    best = None
    best_coverage = -1

    for t in thresholds:
        metrics = evaluate(y_true, y_prob, t)
        if metrics["precision"] >= precision_floor and metrics["coverage"] > best_coverage:
            best = metrics
            best_coverage = metrics["coverage"]

    return best

def baseline_amount_only(X_test, y_test, amounts_test):
    """Baseline: rank by amount ratio closeness to 1.0."""
    scores = []
    for i, x in enumerate(X_test):
        # amountRatio is feature index 1
        ar = x[1]
        score = 1.0 / (1.0 + abs(ar - 1.0))
        scores.append(score)

    # Evaluate at various thresholds (using score as proxy)
    # For baseline, use same positive/negative as ML
    return scores

def main():
    print("=" * 70)
    print("SETTLE SYNTHETIC ML — PILOT TRAINING")
    print("=" * 70)
    print(f"Seed: {SEED}")

    # Load data
    print("\n[1/5] Loading data...")
    features, allocations, config = load_data()

    # Filter: only pairs with >=2 candidates (ML dataset assertion)
    # Group by payment_id
    by_payment = defaultdict(list)
    for f in features:
        by_payment[f["payment_id"]].append(f)

    # Filter payments with >=2 candidates
    valid_payments = {pid: pairs for pid, pairs in by_payment.items() if len(pairs) >= 2}
    print(f"  Total pairs: {len(features)}")
    print(f"  Valid payments (>=2 candidates): {len(valid_payments)}")

    # Flatten back
    filtered = []
    for pid, pairs in valid_payments.items():
        filtered.extend(pairs)

    # Split by customer (entity split)
    # We need to map payment_id -> customer_id from allocations
    # Since we don't have customer_id in features, we'll use payment_id prefix
    # Actually, let's use a simple random split by payment_id
    payment_ids = list(valid_payments.keys())
    random.shuffle(payment_ids)
    n = len(payment_ids)
    train_end = int(n * 0.7)
    val_end = int(n * 0.85)

    train_pids = set(payment_ids[:train_end])
    val_pids = set(payment_ids[train_end:val_end])
    test_pids = set(payment_ids[val_end:])

    def extract_split(pids):
        X, y = [], []
        for f in filtered:
            if f["payment_id"] in pids:
                X.append([float(f[fn]) for fn in FEATURE_NAMES])
                y.append(int(f["label"]))
        return X, y

    X_train, y_train = extract_split(train_pids)
    X_val, y_val = extract_split(val_pids)
    X_test, y_test = extract_split(test_pids)

    print(f"\n[2/5] Split:")
    print(f"  Train: {len(train_pids)} payments, {len(X_train)} pairs")
    print(f"  Val:   {len(val_pids)} payments, {len(X_val)} pairs")
    print(f"  Test:  {len(test_pids)} payments, {len(X_test)} pairs")
    print(f"  Train pos ratio: {sum(y_train)/len(y_train):.4f}")
    print(f"  Val pos ratio: {sum(y_val)/len(y_val):.4f}")
    print(f"  Test pos ratio: {sum(y_test)/len(y_test):.4f}")

    # Normalize
    print("\n[3/5] Normalizing...")
    X_train_norm, means, stds = normalize(X_train)
    X_val_norm = [(X_val[i][j] - means[j]) / stds[j] for i in range(len(X_val)) for j in range(len(FEATURE_NAMES))]
    X_val_norm = [[(X_val[i][j] - means[j]) / stds[j] for j in range(len(FEATURE_NAMES))] for i in range(len(X_val))]
    X_test_norm = [[(X_test[i][j] - means[j]) / stds[j] for j in range(len(FEATURE_NAMES))] for i in range(len(X_test))]

    # Train
    print("\n[4/5] Training logistic regression...")
    w, b = train_lr(X_train_norm, y_train, lr=0.1, epochs=200)

    # Predict
    prob_val = predict(X_val_norm, w, b)
    prob_test = predict(X_test_norm, w, b)

    # Evaluate at various thresholds
    print("\n[5/5] Evaluation:")

    # Validation set
    print("\n  Validation set:")
    for t in [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]:
        metrics = evaluate(y_val, prob_val, t)
        print(f"    T={t:.2f}: P={metrics['precision']:.3f} R={metrics['recall']:.3f} "
              f"Cov={metrics['coverage']:.3f} n={metrics['n_accepted']}")

    # Find optimal threshold on validation
    print("\n  Optimal threshold (precision≥0.95):")
    opt_val = find_optimal_threshold(y_val, prob_val, precision_floor=0.95)
    if opt_val:
        print(f"    T={opt_val['threshold']:.4f}: P={opt_val['precision']:.3f} "
              f"R={opt_val['recall']:.3f} Cov={opt_val['coverage']:.3f} "
              f"n={opt_val['n_accepted']}/{len(y_val)}")
    else:
        print("    No threshold achieves precision ≥ 0.95")

    # Test set with optimal threshold
    print("\n  Test set:")
    if opt_val:
        t_opt = opt_val["threshold"]
        test_metrics = evaluate(y_test, prob_test, t_opt)
        print(f"    T={t_opt:.4f}: P={test_metrics['precision']:.3f} "
              f"R={test_metrics['recall']:.3f} Cov={test_metrics['coverage']:.3f} "
              f"n={test_metrics['n_accepted']}/{len(y_test)}")

    # Baselines
    print("\n  Baselines (amount-only):")
    # Simple baseline: positive if amountRatio close to 1.0
    baseline_val = [1.0 / (1.0 + abs(X_val[i][1] - 1.0)) for i in range(len(X_val))]
    baseline_test = [1.0 / (1.0 + abs(X_test[i][1] - 1.0)) for i in range(len(X_test))]

    for t in [0.5, 0.7, 0.9]:
        bm_val = evaluate(y_val, baseline_val, t)
        bm_test = evaluate(y_test, baseline_test, t)
        print(f"    T={t:.2f}: Val P={bm_val['precision']:.3f} Cov={bm_val['coverage']:.3f} | "
              f"Test P={bm_test['precision']:.3f} Cov={bm_test['coverage']:.3f}")

    # Save results
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    results = {
        "seed": SEED,
        "features": FEATURE_NAMES,
        "train": {"payments": len(train_pids), "pairs": len(X_train), "pos_ratio": sum(y_train)/len(y_train)},
        "val": {"payments": len(val_pids), "pairs": len(X_val), "pos_ratio": sum(y_val)/len(y_val)},
        "test": {"payments": len(test_pids), "pairs": len(X_test), "pos_ratio": sum(y_test)/len(y_test)},
        "optimal_threshold_val": opt_val,
        "weights": {"w": w, "b": b, "means": means, "stds": stds},
    }

    with open(os.path.join(OUTPUT_DIR, "training-results.json"), "w") as f:
        json.dump(results, f, indent=2, default=str)

    print(f"\nResults saved to {OUTPUT_DIR}/training-results.json")

    # Feature importance
    print("\n  Feature importance (|weight|):")
    importance = sorted(zip(FEATURE_NAMES, w), key=lambda x: abs(x[1]), reverse=True)
    for name, weight in importance:
        print(f"    {name:35s} {weight:+.4f}")

if __name__ == "__main__":
    main()
