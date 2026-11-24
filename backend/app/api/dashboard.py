from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.models import DatasetMetadata, Prediction, Transaction
from app.schemas.schemas import DashboardStats

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
def dashboard_stats(db: Session = Depends(get_db)):
    """All values come from the database -- nothing here is hardcoded."""
    meta = db.query(DatasetMetadata).order_by(DatasetMetadata.id.desc()).first()
    if meta is None:
        return DashboardStats(total_transactions=0, legitimate=0, illicit=0, unknown=0,
                              high_risk_predictions=0, dataset_loaded=False, dataset_source=None)

    high_risk = (db.query(func.count(Prediction.id))
                .filter(Prediction.risk_level.in_(("High", "Critical"))).scalar() or 0)
    return DashboardStats(
        total_transactions=meta.total_transactions, legitimate=meta.licit_count,
        illicit=meta.illicit_count, unknown=meta.unknown_count,
        high_risk_predictions=high_risk, dataset_loaded=True, dataset_source=meta.source)
