from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.models import Alert
from app.schemas.schemas import AlertOut, AlertUpdate, PaginatedAlerts
from app.services.alerts_service import generate_alerts
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=PaginatedAlerts)
def list_alerts(
    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=500),
    severity: str | None = Query(None, pattern="^(Critical|High|Medium|Low)$"),
    status: str | None = Query(None, pattern="^(open|acknowledged|resolved)$"),
    search: str | None = None,
    sort_by: str = Query("created_at", pattern="^(created_at|risk_score|severity)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    q = db.query(Alert)
    if severity:
        q = q.filter(Alert.severity == severity)
    if status:
        q = q.filter(Alert.status == status)
    if search:
        try:
            q = q.filter(Alert.transaction_id == int(search))
        except ValueError:
            q = q.filter(Alert.transaction_id == -1)
    sort_col = {"created_at": Alert.created_at, "risk_score": Alert.risk_score,
               "severity": Alert.severity}[sort_by]
    q = q.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
    items, total, pages = paginate(q, page, page_size)
    return PaginatedAlerts(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/generate")
def regenerate_alerts(db: Session = Depends(get_db)):
    """Re-scans predictions and creates/updates alerts above the risk threshold."""
    return generate_alerts(db)


@router.patch("/{alert_id}", response_model=AlertOut)
def update_alert(alert_id: int, body: AlertUpdate, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if alert is None:
        raise HTTPException(404, f"Alert {alert_id} not found.")
    alert.status = body.status
    db.commit()
    db.refresh(alert)
    return alert


@router.get("/{alert_id}", response_model=AlertOut)
def get_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if alert is None:
        raise HTTPException(404, f"Alert {alert_id} not found.")
    return alert
