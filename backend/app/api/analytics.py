from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.models import ModelMetrics, Prediction, Transaction
from app.schemas.schemas import (ClassificationBucket, FeatureImportanceItem, ModelPerformanceOut,
                                 RiskDistributionBucket, TimeSeriesPoint)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])
MODELS_DIR = Path(__file__).resolve().parents[3] / "ml_models"


@router.get("/classification", response_model=list[ClassificationBucket])
def classification(db: Session = Depends(get_db)):
    rows = (db.query(Transaction.original_label, func.count(Transaction.id))
           .group_by(Transaction.original_label).all())
    return [ClassificationBucket(label=label, count=count) for label, count in rows]


@router.get("/time-series", response_model=list[TimeSeriesPoint])
def time_series(db: Session = Depends(get_db)):
    """Transaction volume and illicit counts (known + predicted) per time step."""
    totals = dict(db.query(Transaction.time_step, func.count(Transaction.id))
                 .group_by(Transaction.time_step).all())
    known_illicit = dict(db.query(Transaction.time_step, func.count(Transaction.id))
                        .filter(Transaction.original_label == "illicit")
                        .group_by(Transaction.time_step).all())
    pred_illicit = dict(db.query(Transaction.time_step, func.count(Prediction.id))
                       .join(Prediction, Transaction.transaction_id == Prediction.transaction_id)
                       .filter(Prediction.predicted_label == "illicit")
                       .group_by(Transaction.time_step).all())
    return [TimeSeriesPoint(time_step=t, total=totals[t], illicit_known=known_illicit.get(t, 0),
                            illicit_predicted=pred_illicit.get(t, 0))
           for t in sorted(totals)]


@router.get("/risk-distribution", response_model=list[RiskDistributionBucket])
def risk_distribution(db: Session = Depends(get_db)):
    rows = dict(db.query(Prediction.risk_level, func.count(Prediction.id))
               .group_by(Prediction.risk_level).all())
    order = ["Low", "Medium", "High", "Critical"]
    return [RiskDistributionBucket(level=lvl, count=rows.get(lvl, 0)) for lvl in order]


@router.get("/model-performance", response_model=list[ModelPerformanceOut])
def model_performance(split: str = "test", db: Session = Depends(get_db)):
    latest_run = db.query(func.max(ModelMetrics.run_id)).scalar()
    if latest_run is None:
        raise HTTPException(404, "No model metrics found. Train a model first "
                            "(POST /api/model/train).")
    rows = (db.query(ModelMetrics)
           .filter(ModelMetrics.run_id == latest_run, ModelMetrics.split == split).all())
    return [ModelPerformanceOut(model_name=r.model_name, is_default=r.is_default,
                                accuracy=r.accuracy, illicit_precision=r.illicit_precision,
                                illicit_recall=r.illicit_recall, illicit_f1=r.illicit_f1,
                                roc_auc=r.roc_auc, pr_auc=r.pr_auc,
                                confusion_matrix=r.confusion_matrix, split=r.split)
           for r in rows]


@router.get("/feature-importance", response_model=list[FeatureImportanceItem])
def feature_importance(model_name: str = "random_forest"):
    path = MODELS_DIR / "feature_importance.json"
    if not path.is_file():
        raise HTTPException(404, "No feature importance file found. Train a model first.")
    data = json.loads(path.read_text())
    if model_name not in data:
        raise HTTPException(404, f"No feature importance for model '{model_name}'.")
    return [FeatureImportanceItem(**row) for row in data[model_name]]
