"""
Loads the outputs of backend/app/ml/elliptic_pipeline.py (predictions.csv,
dataset_summary.json, ml_models/metrics.json) into the SQLite database.

Idempotent: re-running with the same CSV does not create duplicate rows --
existing transactions/predictions are updated in place (upsert), matching the
spec's "avoid inserting duplicate transaction records" requirement.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from sqlalchemy.orm import Session

from app.models.models import DatasetMetadata, InvestigationStatus, ModelMetrics, Prediction, Transaction

CHUNK = 5000  # rows per commit, keeps memory bounded for 200k+ row datasets


class LoadError(Exception):
    pass


def _require(path: Path, what: str) -> Path:
    if not path.is_file():
        raise LoadError(f"{what} not found at {path}. Run the ML pipeline first "
                        "(backend/app/ml/elliptic_pipeline.py).")
    return path


def load_predictions(db: Session, processed_dir: Path, source: str = "real") -> dict:
    """Upsert transactions + predictions from data/processed/predictions.csv."""
    csv_path = _require(processed_dir / "predictions.csv", "predictions.csv")
    summary_path = _require(processed_dir / "dataset_summary.json", "dataset_summary.json")

    n_inserted = n_updated = 0
    existing_tx = {t.transaction_id: t for t in db.query(Transaction).all()}
    existing_pred = {p.transaction_id: p for p in db.query(Prediction).all()}

    for chunk in pd.read_csv(csv_path, chunksize=CHUNK):
        for row in chunk.itertuples(index=False):
            tx_id = int(row.transaction_id)
            if tx_id in existing_tx:
                tx = existing_tx[tx_id]
                tx.time_step = int(row.time_step)
                tx.original_label = row.original_label
                tx.split = row.split
                tx.out_degree = int(row.out_degree)
                tx.in_degree = int(row.in_degree)
                tx.illicit_neighbors = int(row.illicit_neighbors)
                n_updated += 1
            else:
                tx = Transaction(transaction_id=tx_id, time_step=int(row.time_step),
                                 original_label=row.original_label, split=row.split,
                                 out_degree=int(row.out_degree), in_degree=int(row.in_degree),
                                 illicit_neighbors=int(row.illicit_neighbors))
                db.add(tx)
                existing_tx[tx_id] = tx
                db.add(InvestigationStatus(transaction_id=tx_id, status="unreviewed"))
                n_inserted += 1

            if tx_id in existing_pred:
                p = existing_pred[tx_id]
                p.predicted_label = row.predicted_label
                p.illicit_probability = float(row.illicit_probability)
                p.risk_score = float(row.risk_score)
                p.risk_level = row.risk_level
            else:
                db.add(Prediction(transaction_id=tx_id, model_name="random_forest",
                                  predicted_label=row.predicted_label,
                                  illicit_probability=float(row.illicit_probability),
                                  risk_score=float(row.risk_score), risk_level=row.risk_level))
        db.commit()

    summary = json.loads(summary_path.read_text())
    db.query(DatasetMetadata).delete()
    db.add(DatasetMetadata(
        source=source, total_transactions=summary["total_transactions"],
        illicit_count=summary["illicit"], licit_count=summary["licit"],
        unknown_count=summary["unknown"], total_edges=summary["total_edges"],
        time_step_min=summary["time_steps"][0], time_step_max=summary["time_steps"][1],
        warnings=summary.get("warnings", [])))
    db.commit()
    return {"inserted": n_inserted, "updated": n_updated, "total": n_inserted + n_updated}


def load_model_metrics(db: Session, models_dir: Path) -> dict:
    """Load ml_models/metrics.json into the model_metrics table (one run per call)."""
    metrics_path = _require(models_dir / "metrics.json", "metrics.json")
    metrics = json.loads(metrics_path.read_text())
    run_id = f"{metrics.get('generated_at', datetime.now(timezone.utc).isoformat())}-{uuid.uuid4().hex[:6]}"
    default = metrics["default_model"]

    rows = 0
    for model_name, m in metrics["models"].items():
        for split in ("val", "test"):
            s = m[split]
            db.add(ModelMetrics(
                run_id=run_id, model_name=model_name, is_default=(model_name == default),
                accuracy=s["accuracy"], illicit_precision=s["illicit_precision"],
                illicit_recall=s["illicit_recall"], illicit_f1=s["illicit_f1"],
                roc_auc=s["roc_auc"], pr_auc=s["pr_auc"],
                confusion_matrix=s["confusion_matrix"], split=split))
            rows += 1
    db.commit()
    return {"run_id": run_id, "rows_written": rows, "default_model": default}
