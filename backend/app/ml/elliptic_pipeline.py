#!/usr/bin/env python3
"""
BITCOIN SENTINEL - Elliptic dataset ML pipeline
================================================

Loads the Elliptic Bitcoin Transaction Dataset, validates and preprocesses it,
trains Logistic Regression / Decision Tree / Random Forest classifiers with a
time-aware split, evaluates them honestly on the illicit class, and writes:

    ml_models/<model>.joblib        self-contained model bundles
    ml_models/metrics.json          validation + test metrics for every model
    ml_models/feature_importance.json
    data/processed/predictions.csv  predictions for EVERY transaction (incl. unknown)
    data/processed/dataset_summary.json

Run from the project root:

    python backend/app/ml/elliptic_pipeline.py                 # uses data/raw
    python backend/app/ml/elliptic_pipeline.py --raw-dir PATH  # custom location

Design notes
------------
* Original dataset labels are NEVER modified. `original_label` (illicit / licit /
  unknown) is stored separately from `predicted_label`.
* Unknown transactions are excluded from training/evaluation, but still scored.
* Split is by time step (no shuffling) so the model is never evaluated on the
  past of its training data. Imputer/scaler are fit on the training rows only
  (they live inside the sklearn Pipeline), which prevents preprocessing leakage.
* Risk score = 100 * P(illicit). It is a model estimate, not proof of crime.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, average_precision_score, confusion_matrix,
                             f1_score, precision_score, recall_score, roc_auc_score)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

ROOT = Path(__file__).resolve().parents[3]          # bitcoin-sentinel/
FEATURES_FILE = "elliptic_txs_features.csv"
CLASSES_FILE = "elliptic_txs_classes.csv"
EDGES_FILE = "elliptic_txs_edgelist.csv"

LABEL_MAP = {"1": "illicit", "2": "licit", "unknown": "unknown"}
RISK_DISCLAIMER = ("Risk scores are model estimates derived from the illicit-class "
                   "probability. They are not proof of criminal activity.")


class DatasetError(Exception):
    """Raised for missing / malformed dataset files (shown to the user as-is)."""


# --------------------------------------------------------------------------- #
# Risk helpers
# --------------------------------------------------------------------------- #
def risk_score(prob_illicit: np.ndarray) -> np.ndarray:
    """0-100 score from the illicit-class probability."""
    return np.clip(np.asarray(prob_illicit, dtype=float) * 100.0, 0.0, 100.0)


def risk_level(score: np.ndarray) -> np.ndarray:
    """0-24 Low, 25-49 Medium, 50-74 High, 75-100 Critical."""
    s = np.asarray(score, dtype=float)
    return np.select([s < 25, s < 50, s < 75], ["Low", "Medium", "High"], "Critical")


# --------------------------------------------------------------------------- #
# Progress reporting (the API can poll this file for a progress bar)
# --------------------------------------------------------------------------- #
class Progress:
    def __init__(self, path: Path | None):
        self.path, self.t0 = path, time.time()

    def update(self, stage: str, pct: int, **extra):
        msg = f"[{time.time() - self.t0:6.1f}s] {pct:3d}%  {stage}"
        print(msg, flush=True)
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps({"stage": stage, "percent": pct, **extra}))


# --------------------------------------------------------------------------- #
# Dataset loading + validation
# --------------------------------------------------------------------------- #
def check_files(raw_dir: Path) -> dict:
    """Return {filename: exists} so the UI can show which files are missing."""
    return {n: (raw_dir / n).is_file() for n in (FEATURES_FILE, CLASSES_FILE, EDGES_FILE)}


def _read_features(path: Path) -> pd.DataFrame:
    """Features CSV has no header: col0=txId, col1=time step, rest = features."""
    first = path.open().readline().strip().split(",")
    ncols = len(first)
    if ncols < 4:
        raise DatasetError(f"{path.name}: expected txId, time step and >=2 feature "
                           f"columns, found {ncols} columns.")
    try:
        float(first[0]); has_header = False
    except ValueError:
        has_header = True
    dtypes = {i: np.float32 for i in range(2, ncols)}
    dtypes[0], dtypes[1] = np.int64, np.float64   # float first: tolerate stray NaN
    df = pd.read_csv(path, header=None, skiprows=1 if has_header else 0, dtype=dtypes)
    return df


def load_dataset(raw_dir: Path) -> dict:
    """Load, validate and align the three Elliptic CSVs. Returns a dict."""
    present = check_files(raw_dir)
    missing = [n for n, ok in present.items() if not ok]
    if missing:
        raise DatasetError(f"Missing required file(s) in {raw_dir}: {', '.join(missing)}")

    report: dict = {"warnings": []}

    # ---- features ---------------------------------------------------------
    feat = _read_features(raw_dir / FEATURES_FILE)
    n_cols = feat.shape[1]
    # Elliptic = 93 local + 72 aggregated features; name them accordingly if so.
    n_feat = n_cols - 2
    if n_feat == 165:
        names = [f"local_{i}" for i in range(1, 94)] + [f"agg_{i}" for i in range(1, 73)]
    else:
        names = [f"feature_{i}" for i in range(1, n_feat + 1)]
        report["warnings"].append(f"Expected 165 feature columns, found {n_feat}; "
                                  "using generic feature names.")
    feat.columns = ["txId", "time_step"] + names

    dups = int(feat.duplicated("txId").sum())
    if dups:
        report["warnings"].append(f"{dups} duplicate transaction IDs in features; kept first.")
        feat = feat.drop_duplicates("txId", keep="first")
    report["duplicate_transactions_removed"] = dups

    if feat["time_step"].isna().any():
        raise DatasetError("Time step column contains missing values.")
    feat["time_step"] = feat["time_step"].astype(int)
    report["missing_feature_values"] = int(feat[names].isna().sum().sum())

    # ---- classes ----------------------------------------------------------
    cls = pd.read_csv(raw_dir / CLASSES_FILE, dtype=str)
    cls.columns = [c.strip() for c in cls.columns]
    if not {"txId", "class"}.issubset(cls.columns):
        raise DatasetError(f"{CLASSES_FILE} must have columns 'txId' and 'class' "
                           f"(found {list(cls.columns)}).")
    cls["class"] = cls["class"].str.strip().str.lower()
    bad = sorted(set(cls["class"]) - set(LABEL_MAP))
    if bad:
        raise DatasetError(f"{CLASSES_FILE}: unexpected class values {bad}; "
                           "expected 1, 2 or unknown.")
    cls["txId"] = cls["txId"].astype(np.int64)
    cls = cls.drop_duplicates("txId", keep="first")
    cls["original_label"] = cls["class"].map(LABEL_MAP)

    meta = feat[["txId", "time_step"]].merge(cls[["txId", "original_label"]],
                                             on="txId", how="left")
    no_class = int(meta["original_label"].isna().sum())
    if no_class:
        report["warnings"].append(f"{no_class} transactions have no class row; "
                                  "treated as 'unknown'.")
    meta["original_label"] = meta["original_label"].fillna("unknown")
    extra = len(set(cls["txId"]) - set(meta["txId"]))
    if extra:
        report["warnings"].append(f"{extra} class rows reference unknown tx IDs; ignored.")

    # ---- edges ------------------------------------------------------------
    edges = pd.read_csv(raw_dir / EDGES_FILE)
    edges.columns = [c.strip() for c in edges.columns]
    if not {"txId1", "txId2"}.issubset(edges.columns):
        raise DatasetError(f"{EDGES_FILE} must have columns 'txId1' and 'txId2'.")
    edges = edges[["txId1", "txId2"]].astype(np.int64)
    n_raw_edges = len(edges)
    edges = edges.drop_duplicates()
    report["duplicate_edges_removed"] = n_raw_edges - int(len(edges))
    ids = set(meta["txId"])
    ok = edges["txId1"].isin(ids) & edges["txId2"].isin(ids)
    if (~ok).any():
        report["warnings"].append(f"{int((~ok).sum())} edges reference unknown tx IDs; dropped.")
    edges = edges[ok].reset_index(drop=True)

    counts = meta["original_label"].value_counts().to_dict()
    report.update({
        "total_transactions": int(len(meta)),
        "illicit": int(counts.get("illicit", 0)),
        "licit": int(counts.get("licit", 0)),
        "unknown": int(counts.get("unknown", 0)),
        "total_edges": int(len(edges)),
        "n_features": n_feat,
        "time_steps": [int(meta.time_step.min()), int(meta.time_step.max())],
    })
    return {"meta": meta, "X": feat[names], "edges": edges,
            "feature_names": names, "report": report}


def add_graph_stats(meta: pd.DataFrame, edges: pd.DataFrame) -> pd.DataFrame:
    """In/out degree and number of known-illicit neighbours (from the edge list)."""
    out = meta.copy()
    out["out_degree"] = out["txId"].map(edges["txId1"].value_counts()).fillna(0).astype(int)
    out["in_degree"] = out["txId"].map(edges["txId2"].value_counts()).fillna(0).astype(int)
    illicit = set(meta.loc[meta.original_label == "illicit", "txId"])
    # illicit successors of each tx / illicit predecessors of each tx
    succ = edges[edges["txId2"].isin(illicit)]["txId1"].value_counts()
    pred = edges[edges["txId1"].isin(illicit)]["txId2"].value_counts()
    out["illicit_neighbors"] = (out["txId"].map(succ).fillna(0)
                                + out["txId"].map(pred).fillna(0)).astype(int)
    return out


# --------------------------------------------------------------------------- #
# Time-aware split
# --------------------------------------------------------------------------- #
def make_split(meta: pd.DataFrame, train_end: int, val_end: int) -> pd.Series:
    """train: step<=train_end, val: train_end<step<=val_end, test: step>val_end."""
    split = np.select([meta.time_step <= train_end, meta.time_step <= val_end],
                      ["train", "val"], "test")
    return pd.Series(split, index=meta.index, name="split")


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
def build_models(seed: int, n_trees: int) -> dict[str, Pipeline]:
    """Imputer (and scaler for LR) sit inside the Pipeline => fit on train only."""
    imp = lambda: SimpleImputer(strategy="median")
    return {
        "logistic_regression": Pipeline([
            ("imputer", imp()), ("scaler", StandardScaler()),
            ("clf", LogisticRegression(class_weight="balanced", max_iter=2000,
                                       C=1.0, random_state=seed))]),
        "decision_tree": Pipeline([
            ("imputer", imp()),
            ("clf", DecisionTreeClassifier(class_weight="balanced", max_depth=12,
                                           min_samples_leaf=5, random_state=seed))]),
        "random_forest": Pipeline([
            ("imputer", imp()),
            ("clf", RandomForestClassifier(n_estimators=n_trees, min_samples_leaf=2,
                                           class_weight="balanced_subsample",
                                           n_jobs=-1, random_state=seed))]),
    }


def evaluate(y_true: np.ndarray, proba: np.ndarray, threshold: float = 0.5) -> dict:
    """Metrics with illicit (=1) as the positive class."""
    y_pred = (proba >= threshold).astype(int)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    both = len(np.unique(y_true)) == 2
    return {
        "n": int(len(y_true)), "n_illicit": int(y_true.sum()),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "illicit_precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "illicit_recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "illicit_f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "macro_f1": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, proba)) if both else None,
        "pr_auc": float(average_precision_score(y_true, proba)) if both else None,
        # rows = actual [licit, illicit], cols = predicted [licit, illicit]
        "confusion_matrix": {"labels": ["licit", "illicit"], "matrix": cm.tolist(),
                             "tn": int(cm[0, 0]), "fp": int(cm[0, 1]),
                             "fn": int(cm[1, 0]), "tp": int(cm[1, 1])},
    }


def per_timestep_metrics(steps, y_true, proba, threshold=0.5) -> list[dict]:
    rows = []
    for s in sorted(np.unique(steps)):
        m = steps == s
        yp = (proba[m] >= threshold).astype(int)
        rows.append({"time_step": int(s), "n": int(m.sum()), "n_illicit": int(y_true[m].sum()),
                     "illicit_precision": float(precision_score(y_true[m], yp, zero_division=0)),
                     "illicit_recall": float(recall_score(y_true[m], yp, zero_division=0)),
                     "illicit_f1": float(f1_score(y_true[m], yp, zero_division=0))})
    return rows


def feature_importances(pipe: Pipeline) -> np.ndarray:
    """Normalised (sum=1) importance: impurity-based for trees, |coef| for LR."""
    est = pipe.steps[-1][1]
    raw = est.feature_importances_ if hasattr(est, "feature_importances_") \
        else np.abs(est.coef_).ravel()
    return raw / raw.sum() if raw.sum() > 0 else raw


def reference_stats(X_licit: np.ndarray) -> dict:
    """Median + robust scale (MAD) of licit training rows, used for explanations."""
    med = np.nanmedian(X_licit, axis=0)
    mad = np.nanmedian(np.abs(X_licit - med), axis=0) * 1.4826
    scale = np.where(mad < 1e-6, np.nanstd(X_licit, axis=0), mad)
    scale = np.where(np.isfinite(scale) & (scale > 1e-6), scale, 1.0)
    return {"median": med.tolist(), "scale": scale.tolist()}


# --------------------------------------------------------------------------- #
# Inference API (imported by the FastAPI backend)
# --------------------------------------------------------------------------- #
def load_bundle(path: Path) -> dict:
    return joblib.load(path)


def predict_features(bundle: dict, X) -> pd.DataFrame:
    """
    Score transactions. X: DataFrame (columns reordered to training order) or an
    ndarray with the same column order. Returns predicted_label, probabilities,
    risk_score (0-100) and risk_level.
    """
    names = bundle["feature_names"]
    if isinstance(X, pd.DataFrame):
        missing = [c for c in names if c not in X.columns]
        if missing:
            raise ValueError(f"Missing {len(missing)} feature column(s), e.g. {missing[:3]}")
        arr = X[names].to_numpy(dtype=np.float32)
    else:
        arr = np.asarray(X, dtype=np.float32)
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)
        if arr.shape[1] != len(names):
            raise ValueError(f"Expected {len(names)} features, got {arr.shape[1]}.")
    p = bundle["model"].predict_proba(arr)[:, 1]
    score = risk_score(p)
    return pd.DataFrame({
        "predicted_label": np.where(p >= bundle["threshold"], "illicit", "licit"),
        "illicit_probability": p, "licit_probability": 1 - p,
        "risk_score": np.round(score, 2), "risk_level": risk_level(score),
    })


def explain_prediction(bundle: dict, x: np.ndarray, top_k: int = 5) -> list[dict]:
    """
    Heuristic explanation for ONE transaction: features that matter most to the
    model (global importance) AND are most unusual versus licit training
    transactions (robust z-score). Not SHAP; not a causal statement.
    """
    x = np.asarray(x, dtype=float).ravel()
    ref = bundle["reference"]
    med, scale = np.array(ref["median"]), np.array(ref["scale"])
    z = np.nan_to_num((x - med) / scale)
    contrib = np.array(bundle["importance"]) * np.abs(z)
    out = []
    for j in np.argsort(contrib)[::-1][:top_k]:
        out.append({"feature": bundle["feature_names"][j], "value": float(x[j]),
                    "licit_median": float(med[j]), "robust_z": float(z[j]),
                    "direction": "above" if z[j] > 0 else "below",
                    "global_importance": float(bundle["importance"][j])})
    return out


# --------------------------------------------------------------------------- #
# Main pipeline
# --------------------------------------------------------------------------- #
def run(raw_dir: Path, out_models: Path, out_processed: Path, train_end: int, val_end: int,
        default_model: str, n_trees: int, seed: int, progress_file: Path | None) -> dict:
    prog = Progress(progress_file)
    prog.update("Loading and validating dataset", 5)
    ds = load_dataset(raw_dir)
    meta, X, edges, names = ds["meta"], ds["X"], ds["edges"], ds["feature_names"]
    report = ds["report"]
    steps_lo, steps_hi = report["time_steps"]
    if not (steps_lo <= train_end < val_end < steps_hi):
        raise DatasetError(f"Split must satisfy {steps_lo} <= train_end < val_end < "
                           f"{steps_hi}; got {train_end}, {val_end}.")

    prog.update("Computing graph statistics", 15)
    meta = add_graph_stats(meta, edges)
    meta["split"] = make_split(meta, train_end, val_end)
    out_processed.mkdir(parents=True, exist_ok=True)
    edges.to_csv(out_processed / "edges_cache.csv", index=False)  # used by the /neighbors API

    # Supervised set = labelled only. illicit=1, licit=0. Unknown never used to train.
    labelled = meta["original_label"] != "unknown"
    y_all = (meta["original_label"] == "illicit").astype(int).to_numpy()
    X_np = X.to_numpy(dtype=np.float32)
    idx = {s: np.where(labelled & (meta["split"] == s))[0] for s in ("train", "val", "test")}
    for s, ix in idx.items():
        if len(ix) == 0:
            raise DatasetError(f"No labelled transactions in the {s} split.")
    if len(np.unique(y_all[idx["train"]])) < 2:
        raise DatasetError("Training split contains only one class.")
    report["split"] = {
        "train_steps": [steps_lo, train_end], "val_steps": [train_end + 1, val_end],
        "test_steps": [val_end + 1, steps_hi],
        **{f"{s}_labelled": int(len(ix)) for s, ix in idx.items()},
        **{f"{s}_illicit": int(y_all[ix].sum()) for s, ix in idx.items()}}

    models = build_models(seed, n_trees)
    metrics, importance, bundles = {}, {}, {}
    ref = reference_stats(X_np[idx["train"]][y_all[idx["train"]] == 0])
    for k, (name, pipe) in enumerate(models.items()):
        prog.update(f"Training {name}", 25 + k * 20)
        t0 = time.time()
        pipe.fit(X_np[idx["train"]], y_all[idx["train"]])
        train_time = time.time() - t0
        entry = {"train_seconds": round(train_time, 2)}
        for s in ("val", "test"):
            p = pipe.predict_proba(X_np[idx[s]])[:, 1]
            entry[s] = evaluate(y_all[idx[s]], p)
            if s == "test":
                entry["test_per_time_step"] = per_timestep_metrics(
                    meta["time_step"].to_numpy()[idx["test"]], y_all[idx["test"]], p)
        metrics[name] = entry
        imp = feature_importances(pipe)
        importance[name] = imp
        bundles[name] = {"model": pipe, "feature_names": names, "threshold": 0.5,
                         "importance": imp.tolist(), "reference": ref,
                         "model_name": name, "positive_class": "illicit",
                         "trained_at": datetime.now(timezone.utc).isoformat(),
                         "train_steps": [steps_lo, train_end]}

    # --- save models + metrics ---------------------------------------------
    prog.update("Saving models and metrics", 85)
    out_models.mkdir(parents=True, exist_ok=True)
    out_processed.mkdir(parents=True, exist_ok=True)
    for name, b in bundles.items():
        joblib.dump(b, out_models / f"{name}.joblib", compress=3)

    best_val = max(metrics, key=lambda m: metrics[m]["val"]["illicit_f1"])
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "default_model": default_model, "best_model_by_validation_illicit_f1": best_val,
        "decision_threshold": 0.5, "class_imbalance_handling": "class_weight (balanced)",
        "split_strategy": "time-aware (no shuffling); preprocessing fit on train only",
        "dataset": report, "models": metrics, "disclaimer": RISK_DISCLAIMER,
    }
    (out_models / "metrics.json").write_text(json.dumps(summary, indent=2))
    fi = {m: [{"feature": names[j], "importance": float(imp[j])}
              for j in np.argsort(imp)[::-1][:25]] for m, imp in importance.items()}
    (out_models / "feature_importance.json").write_text(json.dumps(fi, indent=2))
    (out_processed / "dataset_summary.json").write_text(json.dumps(report, indent=2))

    # --- score every transaction with the default model --------------------
    prog.update("Scoring all transactions (incl. unknown)", 92)
    pred = predict_features(bundles[default_model], X_np)
    out = pd.concat([meta.reset_index(drop=True), pred], axis=1)
    out = out.rename(columns={"txId": "transaction_id"})
    # `split` tells the UI which predictions are in-sample (train) vs out-of-sample.
    out.to_csv(out_processed / "predictions.csv", index=False)

    prog.update("Done", 100)
    return summary


def print_summary(s: dict) -> None:
    d = s["dataset"]
    print(f"\nDataset: {d['total_transactions']:,} tx | illicit {d['illicit']:,} | "
          f"licit {d['licit']:,} | unknown {d['unknown']:,} | edges {d['total_edges']:,}")
    for w in d["warnings"]:
        print("  warning:", w)
    print("\nTEST SET (out-of-time), illicit class as positive:")
    print(f"{'model':22s}{'acc':>7s}{'prec':>7s}{'rec':>7s}{'f1':>7s}{'roc':>7s}{'pr':>7s}")
    for name, m in s["models"].items():
        t = m["test"]
        roc = f"{t['roc_auc']:.3f}" if t["roc_auc"] is not None else "  n/a"
        pr = f"{t['pr_auc']:.3f}" if t["pr_auc"] is not None else "  n/a"
        star = " *" if name == s["default_model"] else ""
        print(f"{name:22s}{t['accuracy']:7.3f}{t['illicit_precision']:7.3f}"
              f"{t['illicit_recall']:7.3f}{t['illicit_f1']:7.3f}{roc:>7s}{pr:>7s}{star}")
    print(f"\n* default model: {s['default_model']} | best on validation illicit-F1: "
          f"{s['best_model_by_validation_illicit_f1']}\n{RISK_DISCLAIMER}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw-dir", type=Path, default=ROOT / "data" / "raw")
    ap.add_argument("--models-dir", type=Path, default=ROOT / "ml_models")
    ap.add_argument("--processed-dir", type=Path, default=ROOT / "data" / "processed")
    ap.add_argument("--train-end", type=int, default=29, help="last training time step")
    ap.add_argument("--val-end", type=int, default=34, help="last validation time step")
    ap.add_argument("--default-model", default="random_forest",
                    choices=["logistic_regression", "decision_tree", "random_forest"])
    ap.add_argument("--n-trees", type=int, default=300)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--progress-file", type=Path, default=None)
    a = ap.parse_args(argv)
    try:
        s = run(a.raw_dir, a.models_dir, a.processed_dir, a.train_end, a.val_end,
                a.default_model, a.n_trees, a.seed, a.progress_file)
    except DatasetError as e:
        print(f"DATASET ERROR: {e}\nPlace the Elliptic CSVs ({FEATURES_FILE}, {CLASSES_FILE}, "
              f"{EDGES_FILE}) in {a.raw_dir}.", file=sys.stderr)
        return 2
    print_summary(s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
