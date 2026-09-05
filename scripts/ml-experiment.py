#!/usr/bin/env python3
"""
Settle ML Training + Evaluation Experiment (v3 - Fixed Normalization)
Key fixes: z-score standardization, constant feature removal, proper numerical stability.
"""
import csv, json, math, os, random, sys
from collections import Counter, defaultdict

DATA_DIR = "/Users/aashisoni/Codes/hackathons/Razorpay/data/raw"
SEED = 42
random.seed(SEED)

ALL_FEATURE_NAMES = ["sameCustomer","amountRatio","amountDifference","currencyMatch",
                     "referenceMatch","daysUntilDue","numCandidates","obligationAmount","paymentAmount"]

# ============================================================
# PARSE
# ============================================================
def parse_llmeval():
    base = os.path.join(DATA_DIR, "llmeval-trl24/single/descriptive")
    obls = {}; obls_by_cust = defaultdict(dict)
    with open(os.path.join(base, "invoices.csv")) as f:
        for row in csv.DictReader(f):
            oid = f"ll_{row['invoice_id']}"
            obls[oid] = {"id": oid, "amount": float(row['inv_amount']),
                "currency": row['inv_currency_code'], "customer_id": row['inv_customer_id'],
                "assign": row['inv_assignment_number'], "billing": row['inv_billing_number'],
                "due": row['inv_due_date'], "doc_date": row['inv_document_date']}
            obls_by_cust[row['inv_customer_id']][oid] = obls[oid]
    pays = {}
    with open(os.path.join(base, "payments.csv")) as f:
        for row in csv.DictReader(f):
            pid = f"ll_{row['payment_id']}"
            pays[pid] = {"id": pid, "amount": float(row['pay_amount']),
                "currency": row['pay_currency'], "memo": row.get('pay_memo_line', ''),
                "post_date": row['pay_posting_date']}
    gt = {}
    with open(os.path.join(base, "matches.csv")) as f:
        for row in csv.DictReader(f):
            inv_ids = json.loads(row['invoice_ids'])
            pay_ids = json.loads(row['payment_ids'])
            for pn in pay_ids:
                for invn in inv_ids:
                    gt[f"ll_{pn}"] = f"ll_{invn}"
    return pays, obls, obls_by_cust, gt

def parse_messyops():
    base = os.path.join(DATA_DIR, "messyops")
    obls = {}; obls_by_cust = defaultdict(dict)
    with open(os.path.join(base, "invoices.csv")) as f:
        for row in csv.DictReader(f):
            oid = f"mo_{row['invoice_id']}"
            obls[oid] = {"id": oid, "amount": float(row['invoice_amount']),
                "currency": "USD", "customer_id": row['customer_id'],
                "due": row['due_date'], "inv_date": row['invoice_date']}
            obls_by_cust[row['customer_id']][oid] = obls[oid]
    pays = {}; gt = {}
    with open(os.path.join(base, "payments.csv")) as f:
        for row in csv.DictReader(f):
            pid = f"mo_{row['payment_id']}"
            oid = f"mo_{row['invoice_id']}"
            pays[pid] = {"id": pid, "amount": float(row['payment_amount']),
                "currency": "USD", "pay_date": row['payment_date'],
                "method": row['payment_method']}
            if oid in obls:
                gt[pid] = oid
    return pays, obls, obls_by_cust, gt

# ============================================================
# DETERMINISTIC MATCHING
# ============================================================
def det_match_ll(pay, obls, gt_oid):
    memo = pay.get("memo", "")
    gt_cust = obls[gt_oid]["customer_id"] if gt_oid in obls else None
    for oid, obl in obls.items():
        if gt_cust and obl["customer_id"] != gt_cust: continue
        if obl["assign"] and obl["assign"] in memo: return "STRONG", oid
        if obl["billing"] and obl["billing"] in memo: return "STRONG", oid
    cands = [oid for oid, o in obls.items() if o["customer_id"] == gt_cust and o["amount"] >= pay["amount"]]
    if len(cands) == 1: return "MODERATE", cands[0]
    return "INSUFFICIENT", None

def det_match_mo(pay, obls, obls_by_cust, gt_oid):
    if gt_oid not in obls: return "INSUFFICIENT", None
    gt = obls[gt_oid]
    cands = {oid for oid, o in obls_by_cust[gt["customer_id"]].items() if o["amount"] == pay["amount"]}
    if len(cands) == 1: return "MODERATE", next(iter(cands))
    return "INSUFFICIENT", None

# ============================================================
# FEATURES (raw, before standardization)
# ============================================================
def extract_raw(pay, obl, n_cands, source):
    sc = 1.0 if pay.get("customer_id") == obl.get("customer_id") and pay.get("customer_id") else 0.0
    ar = min(pay["amount"] / obl["amount"], 5.0) if obl["amount"] > 0 else 0.0
    ad = min(abs(pay["amount"] - obl["amount"]), 1e7)
    cm = 1.0 if pay["currency"] == obl["currency"] else 0.0
    rm = 0.0
    if source == "ll" and pay.get("memo"):
        a = obl.get("assign", "")
        b = obl.get("billing", "")
        if a and a in pay["memo"]: rm = 1.0
        elif b and b in pay["memo"]: rm = 0.8
    dtd = 0.0
    if pay.get("post_date") and obl.get("due"):
        try:
            pd_str = pay["post_date"]; dd_str = obl["due"]
            if len(pd_str) == 8: py=int(pd_str[:4]);pm=int(pd_str[4:6]);pd=int(pd_str[6:8])
            else: py=int(pd_str[:4]);pm=int(pd_str[5:7]);pd=int(pd_str[8:10])
            if len(dd_str) == 8: dy=int(dd_str[:4]);dm=int(dd_str[4:6]);dd=int(dd_str[6:8])
            else: dy=int(dd_str[:4]);dm=int(dd_str[5:7]);dd=int(dd_str[8:10])
            dtd = max(-365, min(365, (dy*365+dm*30+dd)-(py*365+pm*30+pd)))
        except: pass
    return [sc, ar, ad, cm, rm, dtd, min(float(n_cands),10), min(obl["amount"],1e7), min(pay["amount"],1e7)]

# ============================================================
# STANDARDIZATION
# ============================================================
def compute_stats(X):
    d = len(X[0])
    means = [0.0]*d; stds = [1.0]*d
    for j in range(d):
        vals = [X[i][j] for i in range(len(X))]
        means[j] = sum(vals)/len(vals)
        var = sum((v-means[j])**2 for v in vals)/len(vals)
        stds[j] = math.sqrt(var) if var > 0 else 1.0
    return means, stds

def standardize(X, means, stds):
    return [[(X[i][j]-means[j])/stds[j] for j in range(len(X[0]))] for i in range(len(X))]

def remove_constant_features(X, feature_names):
    d = len(X[0])
    keep = []
    for j in range(d):
        vals = set(X[i][j] for i in range(len(X)))
        if len(vals) > 1:
            keep.append(j)
    X_filtered = [[X[i][j] for j in keep] for i in range(len(X))]
    names_filtered = [feature_names[j] for j in keep]
    return X_filtered, names_filtered, keep

# ============================================================
# BASELINE
# ============================================================
def baseline_score(pay, obl, source):
    s = 0.0
    if pay.get("customer_id") == obl.get("customer_id") and pay.get("customer_id"): s += 0.4
    if obl["amount"] > 0:
        r = pay["amount"] / obl["amount"]
        if 0.9 <= r <= 1.1: s += 0.3
        elif 0.8 <= r <= 1.2: s += 0.15
    if pay["currency"] == obl["currency"]: s += 0.1
    if source == "ll" and pay.get("memo"):
        a = obl.get("assign", "")
        if a and a in pay["memo"]: s += 0.2
    return min(s, 1.0)

# ============================================================
# LOGISTIC REGRESSION
# ============================================================
def sig(z):
    z = max(-20, min(20, z))
    return 1.0 / (1.0 + math.exp(-z))

def dot(a,b):
    return sum(x*y for x,y in zip(a,b))

def train_lr(X, Y, lr=0.5, iters=200, l2=0.001):
    n, d = len(X), len(X[0])
    w = [0.0]*d; b = 0.0
    for it in range(iters):
        gW = [0.0]*d; gB = 0.0
        for i in range(n):
            p = sig(dot(w, X[i]) + b)
            e = p - Y[i]
            for j in range(d): gW[j] += e * X[i][j]
            gB += e
        for j in range(d):
            gW[j] = gW[j]/n + l2*w[j]
            w[j] -= lr * gW[j]
        b -= lr * (gB/n)
        if it % 50 == 0:
            loss = sum(-(Y[i]*math.log(sig(dot(w,X[i])+b)+1e-15) + (1-Y[i])*math.log(1-sig(dot(w,X[i])+b)+1e-15)) for i in range(n))/n
            print(f"    iter {it}: loss={loss:.4f}")
    return {"w": w, "b": b}

def predict(m, x):
    return sig(dot(m["w"], x) + m["b"])

# ============================================================
# METRICS
# ============================================================
def ranking_metrics(groups):
    t1=t3=mrr_s=tot=0
    for g in groups:
        if not g: continue
        s = sorted(g, key=lambda x: -x["score"])
        tot += 1
        if s[0]["label"]==1: t1+=1
        if any(x["label"]==1 for x in s[:3]): t3+=1
        for r,x in enumerate(s,1):
            if x["label"]==1: mrr_s+=1.0/r; break
    return {"t1":t1/tot if tot else 0, "t3":t3/tot if tot else 0, "mrr":mrr_s/tot if tot else 0, "tot":tot}

def eval_with_threshold(groups, thresh, margin):
    acc=acc_c=tot=0
    for g in groups:
        if not g: continue
        tot+=1
        s=sorted(g,key=lambda x:-x["score"])
        gap=s[0]["score"]-(s[1]["score"] if len(s)>1 else 0)
        if s[0]["score"]>=thresh and gap>=margin:
            acc+=1
            if s[0]["label"]==1: acc_c+=1
    return {"prec":acc_c/acc if acc else 0, "cov":acc/tot if tot else 0, "acc":acc, "acc_c":acc_c, "tot":tot}

# ============================================================
# MAIN
# ============================================================
def main():
    print("="*70)
    print("SETTLE ML TRAINING + EVALUATION EXPERIMENT (v3 - Normalized)")
    print("="*70)
    print(f"Seed: {SEED}")

    ll_pay, ll_obl, ll_by_cust, ll_gt = parse_llmeval()
    mo_pay, mo_obl, mo_by_cust, mo_gt = parse_messyops()
    print(f"Parsed: llmeval {len(ll_pay)}p/{len(ll_obl)}o, MessyOps {len(mo_pay)}p/{len(mo_obl)}o")

    # Deterministic matching
    ll_det={}; ll_c=Counter()
    for pid in ll_pay:
        tier,oid = det_match_ll(ll_pay[pid], ll_obl, ll_gt.get(pid))
        ll_det[pid]=tier; ll_c[tier]+=1
    mo_det={}; mo_c=Counter()
    for pid in mo_pay:
        tier,oid = det_match_mo(mo_pay[pid], mo_obl, mo_by_cust, mo_gt.get(pid))
        mo_det[pid]=tier; mo_c[tier]+=1
    print(f"Det: llmeval={dict(ll_c)}, MessyOps={dict(mo_c)}")

    ll_ml = {p for p,t in ll_det.items() if t=="INSUFFICIENT"}
    mo_ml = {p for p,t in mo_det.items() if t=="INSUFFICIENT" and mo_gt.get(p) in mo_obl}
    print(f"ML-eligible: llmeval={len(ll_ml)}, MessyOps={len(mo_ml)}")

    # Build groups with raw features
    groups = defaultdict(list)
    for pid in ll_ml:
        pay = ll_pay[pid]; gt_oid = ll_gt.get(pid)
        if gt_oid not in ll_obl: continue
        cust = ll_obl[gt_oid]["customer_id"]
        cands = ll_by_cust.get(cust, {})
        if len(cands) < 2: continue
        for oid, obl in cands.items():
            f = extract_raw(pay, obl, len(cands), "ll")
            l = 1 if oid == gt_oid else 0
            groups[pid].append({"oid":oid,"score":0,"label":l,"src":"ll","pid":pid,"f":f})

    mo_count = 0
    for pid in mo_ml:
        if mo_count >= 5000: break
        pay = mo_pay[pid]; gt_oid = mo_gt[pid]
        cust = mo_obl[gt_oid]["customer_id"]
        cands = mo_by_cust.get(cust, {})
        if len(cands) < 2: continue
        for oid, obl in cands.items():
            f = extract_raw(pay, obl, len(cands), "mo")
            l = 1 if oid == gt_oid else 0
            groups[pid].append({"oid":oid,"score":0,"label":l,"src":"mo","pid":pid,"f":f})
        mo_count += 1

    total_pos = sum(1 for g in groups.values() for p in g if p["label"]==1)
    total_neg = sum(1 for g in groups.values() for p in g if p["label"]==0)
    print(f"Groups: {len(groups)} sets, {total_pos} pos, {total_neg} neg")

    # Entity-isolated split
    cust_map = {}
    for gid, pairs in groups.items():
        for p in pairs:
            if p["pid"] not in cust_map:
                obl = ll_obl.get(p["oid"]) or mo_obl.get(p["oid"])
                cust_map[p["pid"]] = obl["customer_id"] if obl else "unknown"
    custs = sorted(set(c for c in cust_map.values() if c!="unknown"))
    n = len(custs); t1=int(n*0.7); t2=int(n*0.85)
    tr_c=set(custs[:t1]); va_c=set(custs[t1:t2]); te_c=set(custs[t2:])
    tr_g=defaultdict(list); va_g=defaultdict(list); te_g=defaultdict(list)
    for gid,pairs in groups.items():
        for p in pairs:
            c = cust_map.get(p["pid"],"unknown")
            if c in tr_c: tr_g[gid].append(p)
            elif c in va_c: va_g[gid].append(p)
            elif c in te_c: te_g[gid].append(p)
    print(f"Split: train={len(tr_g)}s, val={len(va_g)}s, test={len(te_g)}s")

    # Extract raw feature matrices
    all_tr = [p for pairs in tr_g.values() for p in pairs]
    trX_raw = [p["f"] for p in all_tr]
    trY = [p["label"] for p in all_tr]

    # Remove constant features
    print("\n=== Feature Analysis ===")
    for j, name in enumerate(ALL_FEATURE_NAMES):
        vals = set(row[j] for row in trX_raw)
        const = "CONSTANT" if len(vals) == 1 else f"unique={len(vals)}"
        print(f"  {name}: {const}, range=[{min(row[j] for row in trX_raw):.4f}, {max(row[j] for row in trX_raw):.4f}]")

    trX_filtered, kept_names, keep_idx = remove_constant_features(trX_raw, ALL_FEATURE_NAMES)
    print(f"\nKept {len(kept_names)}/{len(ALL_FEATURE_NAMES)} features: {kept_names}")

    # Standardize
    means, stds = compute_stats(trX_filtered)
    trX_std = standardize(trX_filtered, means, stds)
    print(f"Standardization stats: means={[f'{m:.4f}' for m in means]}, stds={[f'{s:.4f}' for s in stds]}")

    # Train LR
    print("\nTraining LR...")
    model = train_lr(trX_std, trY, lr=0.5, iters=200, l2=0.001)
    print(f"\nWeights: {dict(zip(kept_names,[f'{w:.4f}' for w in model['w']]))}")
    print(f"Bias: {model['b']:.4f}")

    # Baseline
    base_te = []
    for gid, pairs in te_g.items():
        g=[]
        for p in pairs:
            obl = ll_obl.get(p["oid"]) or mo_obl.get(p["oid"])
            pay = ll_pay.get(p["pid"]) or mo_pay.get(p["pid"])
            if pay and obl: g.append({"oid":p["oid"],"score":baseline_score(pay,obl,p["src"]),"label":p["label"]})
        if g: base_te.append(g)
    bm = ranking_metrics(base_te)
    print(f"\nBaseline: T1={bm['t1']:.3f}, T3={bm['t3']:.3f}, MRR={bm['mrr']:.3f}")

    # Score test with standardization
    for gid,pairs in te_g.items():
        for p in pairs:
            raw_f = p["f"]
            filtered_f = [raw_f[j] for j in keep_idx]
            std_f = [(filtered_f[j]-means[j])/stds[j] for j in range(len(kept_names))]
            p["score"] = predict(model, std_f)

    # Score validation
    for gid,pairs in va_g.items():
        for p in pairs:
            raw_f = p["f"]
            filtered_f = [raw_f[j] for j in keep_idx]
            std_f = [(filtered_f[j]-means[j])/stds[j] for j in range(len(kept_names))]
            p["score"] = predict(model, std_f)

    # Threshold experiment on validation
    print("\nThreshold Experiment (Validation):")
    thresholds=[0.50,0.55,0.60,0.65,0.70,0.75,0.80,0.85,0.90]
    margins=[0.01,0.02,0.03,0.05,0.10,0.15,0.20,0.25]
    results=[]
    for th in thresholds:
        for mg in margins:
            r=eval_with_threshold(list(va_g.values()),th,mg)
            f1=2*r["prec"]*r["cov"]/(r["prec"]+r["cov"]) if (r["prec"]+r["cov"])>0 else 0
            results.append({"th":th,"mg":mg,**r,"f1":f1})
    results.sort(key=lambda x:-x["f1"])
    print(f"  {'Thresh':>6} {'Margin':>6} {'Acc':>5} {'Corr':>5} {'Prec':>6} {'Cov':>6} {'F1':>6}")
    for r in results[:15]:
        print(f"  {r['th']:>6.2f} {r['mg']:>6.2f} {r['acc']:>5} {r['acc_c']:>5} {r['prec']:>6.3f} {r['cov']:>6.3f} {r['f1']:>6.3f}")
    best=results[0]
    print(f"\n  Selected: threshold={best['th']}, margin={best['mg']}, F1={best['f1']:.3f}")

    te_list=list(te_g.values())
    test_m=ranking_metrics(te_list)
    tr=eval_with_threshold(te_list,best["th"],best["mg"])

    print(f"\nTest (threshold={best['th']}, margin={best['mg']}):")
    print(f"  Sets: {test_m['tot']}")
    print(f"  Top-1: {test_m['t1']:.3f}, Top-3: {test_m['t3']:.3f}, MRR: {test_m['mrr']:.3f}")
    print(f"  Accepted: {tr['acc']}, Correct: {tr['acc_c']}")
    print(f"  Precision: {tr['prec']:.3f}, Coverage: {tr['cov']:.3f}, Abstention: {1-tr['cov']:.3f}")

    for ds,lbl in [("ll","llmeval-trl24"),("mo","messyops")]:
        dg=[g for g in te_list if any(p.get("src")==ds for p in g)]
        if not dg: print(f"  {lbl}: no test groups"); continue
        dm=ranking_metrics(dg); dr=eval_with_threshold(dg,best["th"],best["mg"])
        print(f"  {lbl}: sets={dm['tot']}, T1={dm['t1']:.3f}, MRR={dm['mrr']:.3f}, Prec={dr['prec']:.3f}, Cov={dr['cov']:.3f}")

    print(f"\nBaseline vs ML:")
    print(f"  {'Metric':<20} {'Baseline':>10} {'ML':>10}")
    print(f"  {'Top-1':<20} {bm['t1']:>10.3f} {test_m['t1']:>10.3f}")
    print(f"  {'Top-3':<20} {bm['t3']:>10.3f} {test_m['t3']:>10.3f}")
    print(f"  {'MRR':<20} {bm['mrr']:>10.3f} {test_m['mrr']:>10.3f}")
    beats=test_m['t1']>bm['t1']
    print(f"  ML beats baseline: {'YES' if beats else 'NO'}")

    # False positive analysis
    fps=[]
    for g in te_list:
        s=sorted(g,key=lambda x:-x["score"])
        gap=s[0]["score"]-(s[1]["score"] if len(s)>1 else 0)
        if s[0]["score"]>=best["th"] and gap>=best["mg"] and s[0]["label"]==0:
            corr=next((x for x in g if x["label"]==1),None)
            fps.append({"pid":s[0].get("pid","?"),"pred":s[0]["oid"],"score":s[0]["score"],
                        "correct":corr["oid"] if corr else "NONE","gap":gap,"src":s[0]["src"]})
    print(f"\nFalse positives: {len(fps)}")
    for fp in sorted(fps,key=lambda x:-x["score"])[:10]:
        print(f"  {fp['pid']}: pred={fp['pred']}(score={fp['score']:.4f}), correct={fp['correct']}, gap={fp['gap']:.4f}")

    # Predictions analysis
    print("\n=== Prediction Score Distribution ===")
    all_scores = [p["score"] for g in te_list for p in g]
    correct_scores = [p["score"] for g in te_list for p in g if p["label"]==1]
    wrong_scores = [p["score"] for g in te_list for p in g if p["label"]==0]
    all_scores.sort(); correct_scores.sort(); wrong_scores.sort()
    if correct_scores:
        print(f"  Correct: min={correct_scores[0]:.4f}, median={correct_scores[len(correct_scores)//2]:.4f}, max={correct_scores[-1]:.4f}")
    if wrong_scores:
        print(f"  Wrong:   min={wrong_scores[0]:.4f}, median={wrong_scores[len(wrong_scores)//2]:.4f}, max={wrong_scores[-1]:.4f}")
    
    # Top-1 score vs correct
    print("\n=== Top-1 Score Analysis ===")
    top1_scores_correct = []
    top1_scores_wrong = []
    for g in te_list:
        s = sorted(g, key=lambda x: -x["score"])
        if s[0]["label"] == 1: top1_scores_correct.append(s[0]["score"])
        else: top1_scores_wrong.append(s[0]["score"])
    if top1_scores_correct:
        print(f"  Top-1 correct: n={len(top1_scores_correct)}, mean={sum(top1_scores_correct)/len(top1_scores_correct):.4f}")
    if top1_scores_wrong:
        print(f"  Top-1 wrong:   n={len(top1_scores_wrong)}, mean={sum(top1_scores_wrong)/len(top1_scores_wrong):.4f}")

    # Final
    print("\n"+"="*70)
    print("MACHINE-READABLE OUTPUT")
    print("="*70)
    print(f"MODEL=logistic_regression_scratch_v3")
    print(f"FEATURES_USED={len(kept_names)}")
    print(f"TRAIN_PAIRS={len(all_tr)}")
    print(f"VAL_PAIRS={sum(len(v) for v in va_g.values())}")
    print(f"TEST_PAIRS={sum(len(v) for v in te_g.values())}")
    print(f"TEST_SETS={test_m['tot']}")
    print(f"TOP1_ACCURACY={test_m['t1']:.3f}")
    print(f"TOP3_ACCURACY={test_m['t3']:.3f}")
    print(f"MRR={test_m['mrr']:.3f}")
    print(f"PRECISION={tr['prec']:.3f}")
    print(f"COVERAGE={tr['cov']:.3f}")
    print(f"ABSTENTION={1-tr['cov']:.3f}")
    print(f"BASELINE_TOP1={bm['t1']:.3f}")
    print(f"SELECTED_THRESHOLD={best['th']}")
    print(f"SELECTED_MARGIN={best['mg']}")
    for ds,lbl in [("ll","LLMEVAL"),("mo","MESSYOPS")]:
        dg=[g for g in te_list if any(p.get("src")==ds for p in g)]
        if dg:
            dm=ranking_metrics(dg); dr=eval_with_threshold(dg,best["th"],best["mg"])
            print(f"{lbl}_TOP1={dm['t1']:.3f}")
            print(f"{lbl}_MRR={dm['mrr']:.3f}")
            print(f"{lbl}_PRECISION={dr['prec']:.3f}")
        else:
            print(f"{lbl}_TOP1=N/A"); print(f"{lbl}_MRR=N/A"); print(f"{lbl}_PRECISION=N/A")

if __name__=="__main__":
    main()
