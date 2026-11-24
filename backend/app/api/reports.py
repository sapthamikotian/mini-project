from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.models import Alert, DatasetMetadata, ModelMetrics, Transaction

router = APIRouter(prefix="/api/reports", tags=["reports"])
MODELS_DIR = Path(__file__).resolve().parents[3] / "ml_models"


def _csv_response(rows: list[list], header: list[str], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(buf, media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/transactions")
def report_transactions(db: Session = Depends(get_db)):
    """CSV export of all transaction records with their latest prediction."""
    rows = []
    for tx in db.query(Transaction).limit(200_000).all():
        p = tx.prediction
        rows.append([tx.transaction_id, tx.time_step, tx.original_label,
                    p.predicted_label if p else "", p.risk_score if p else "",
                    p.risk_level if p else ""])
    header = ["transaction_id", "time_step", "original_label", "predicted_label",
             "risk_score", "risk_level"]
    return _csv_response(rows, header, "transactions_report.csv")


@router.get("/alerts")
def report_alerts(db: Session = Depends(get_db)):
    """CSV export of all suspicious-activity alerts."""
    rows = [[a.id, a.transaction_id, a.severity, a.risk_score, a.predicted_label,
            a.original_label, a.time_step, a.status, a.created_at.isoformat()]
           for a in db.query(Alert).limit(200_000).all()]
    header = ["alert_id", "transaction_id", "severity", "risk_score", "predicted_label",
             "original_label", "time_step", "status", "created_at"]
    return _csv_response(rows, header, "alerts_report.csv")


@router.get("/summary")
def report_summary(db: Session = Depends(get_db)):
    """
    JSON report combining dataset stats, model performance, and suspicious
    activity counts -- everything needed for the Reports page's summary view.
    """
    meta = db.query(DatasetMetadata).order_by(DatasetMetadata.id.desc()).first()
    if meta is None:
        raise HTTPException(404, "No dataset loaded yet.")

    latest_run = db.query(func.max(ModelMetrics.run_id)).scalar()
    model_rows = (db.query(ModelMetrics)
                 .filter(ModelMetrics.run_id == latest_run, ModelMetrics.split == "test").all()
                 if latest_run else [])

    alert_counts = dict(db.query(Alert.severity, func.count(Alert.id)).group_by(Alert.severity).all())
    open_alerts = db.query(func.count(Alert.id)).filter(Alert.status == "open").scalar() or 0

    return {
        "report_title": "BITCOIN SENTINEL - Dataset & Model Summary Report",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": {"source": meta.source, "total_transactions": meta.total_transactions,
                   "illicit": meta.illicit_count, "licit": meta.licit_count,
                   "unknown": meta.unknown_count, "total_edges": meta.total_edges,
                   "time_step_range": [meta.time_step_min, meta.time_step_max],
                   "loaded_at": meta.loaded_at.isoformat()},
        "model_performance": [{"model": r.model_name, "is_default": r.is_default,
                               "accuracy": r.accuracy, "illicit_precision": r.illicit_precision,
                               "illicit_recall": r.illicit_recall, "illicit_f1": r.illicit_f1,
                               "roc_auc": r.roc_auc} for r in model_rows],
        "suspicious_activity": {"by_severity": alert_counts, "open_alerts": open_alerts,
                                "total_alerts": sum(alert_counts.values())},
        "disclaimer": ("Risk scores and predicted labels are model estimates, not proof of "
                       "criminal activity. This report reflects a historical research dataset, "
                       "not live blockchain monitoring."),
    }
