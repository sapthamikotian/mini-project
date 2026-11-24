"""
Generates suspicious-activity alerts from predictions + risk thresholds.

Rule (per spec section 9): an alert is created only when the model predicts
illicit AND the risk score clears the chosen severity threshold. A transaction
is never alerted purely for having an 'unknown' original label.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.models import Alert, Prediction, Transaction

# Thresholds mirror the risk-score bands used by the ML pipeline.
SEVERITY_THRESHOLDS = (("Critical", 75), ("High", 50), ("Medium", 25))
MIN_SCORE_FOR_ALERT = 25  # below "Medium", no alert is raised at all


def _severity_for(score: float) -> str | None:
    for name, floor in SEVERITY_THRESHOLDS:
        if score >= floor:
            return name
    return None


def generate_alerts(db: Session, min_score: float = MIN_SCORE_FOR_ALERT) -> dict:
    """Create/update alerts for predicted-illicit transactions above the threshold.
    Idempotent: one alert row per transaction (enforced by a unique constraint)."""
    existing = {a.transaction_id: a for a in db.query(Alert).all()}
    q = (db.query(Prediction, Transaction)
        .join(Transaction, Prediction.transaction_id == Transaction.transaction_id)
        .filter(Prediction.predicted_label == "illicit", Prediction.risk_score >= min_score))

    created = updated = 0
    for pred, tx in q.all():
        severity = _severity_for(pred.risk_score)
        if severity is None:
            continue
        if tx.transaction_id in existing:
            a = existing[tx.transaction_id]
            if a.risk_score != pred.risk_score or a.severity != severity:
                a.risk_score, a.severity = pred.risk_score, severity
                a.predicted_label, a.original_label = pred.predicted_label, tx.original_label
                updated += 1
        else:
            db.add(Alert(transaction_id=tx.transaction_id, severity=severity,
                         risk_score=pred.risk_score, predicted_label=pred.predicted_label,
                         original_label=tx.original_label, time_step=tx.time_step, status="open"))
            created += 1
    db.commit()
    return {"created": created, "updated": updated}
