from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.models import Alert, InvestigationStatus, Prediction, Transaction
from app.schemas.schemas import (NeighborOut, NeighborsResponse, PaginatedTransactions,
                                 TransactionDetail, TransactionOut)
from app.utils.pagination import paginate

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def _to_out(tx: Transaction) -> TransactionOut:
    p = tx.prediction
    inv = tx.investigation
    return TransactionOut(
        transaction_id=tx.transaction_id, time_step=tx.time_step,
        original_label=tx.original_label, predicted_label=p.predicted_label if p else None,
        illicit_probability=p.illicit_probability if p else None,
        risk_score=p.risk_score if p else None, risk_level=p.risk_level if p else None,
        out_degree=tx.out_degree, in_degree=tx.in_degree, illicit_neighbors=tx.illicit_neighbors,
        investigation_status=inv.status if inv else "unreviewed")


def _apply_filters(q, time_step, label, risk_level, search):
    q = q.outerjoin(Prediction, Transaction.transaction_id == Prediction.transaction_id)
    if time_step is not None:
        q = q.filter(Transaction.time_step == time_step)
    if label is not None:
        q = q.filter(Transaction.original_label == label)
    if risk_level is not None:
        q = q.filter(Prediction.risk_level == risk_level)
    if search:
        try:
            tx_id = int(search)
            q = q.filter(Transaction.transaction_id == tx_id)
        except ValueError:
            # non-numeric search can't match an integer transaction id
            q = q.filter(Transaction.transaction_id == -1)
    return q


@router.get("", response_model=PaginatedTransactions)
def list_transactions(
    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=500),
    time_step: int | None = None, label: str | None = Query(None, pattern="^(illicit|licit|unknown)$"),
    risk_level: str | None = Query(None, pattern="^(Low|Medium|High|Critical)$"),
    search: str | None = None,
    sort_by: str = Query("transaction_id", pattern="^(transaction_id|time_step|risk_score)$"),
    sort_dir: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    q = _apply_filters(db.query(Transaction), time_step, label, risk_level, search)
    sort_col = {"transaction_id": Transaction.transaction_id, "time_step": Transaction.time_step,
               "risk_score": Prediction.risk_score}[sort_by]
    q = q.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
    items, total, pages = paginate(q, page, page_size)
    return PaginatedTransactions(items=[_to_out(t) for t in items], total=total,
                                 page=page, page_size=page_size, pages=pages)


@router.get("/search", response_model=PaginatedTransactions)
def search_transactions(q: str = Query(..., min_length=1), page: int = Query(1, ge=1),
                        page_size: int = Query(25, ge=1, le=500), db: Session = Depends(get_db)):
    return list_transactions(page=page, page_size=page_size, search=q, db=db)  # type: ignore[arg-type]


@router.get("/export")
def export_transactions(label: str | None = None, risk_level: str | None = None,
                        time_step: int | None = None, db: Session = Depends(get_db)):
    """Export filtered transactions to CSV."""
    q = _apply_filters(db.query(Transaction), time_step, label, risk_level, None)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["transaction_id", "time_step", "original_label", "predicted_label",
                     "illicit_probability", "risk_score", "risk_level", "out_degree",
                     "in_degree", "illicit_neighbors"])
    for tx in q.limit(200_000).all():
        p = tx.prediction
        writer.writerow([tx.transaction_id, tx.time_step, tx.original_label,
                         p.predicted_label if p else "", p.illicit_probability if p else "",
                         p.risk_score if p else "", p.risk_level if p else "",
                         tx.out_degree, tx.in_degree, tx.illicit_neighbors])
    buf.seek(0)
    return StreamingResponse(buf, media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=transactions.csv"})


def _edges_cache_path():
    from pathlib import Path
    return Path(__file__).resolve().parents[3] / "data" / "processed" / "edges_cache.csv"


def _neighbor_rows(transaction_id: int) -> tuple[list[int], list[int]]:
    """Returns (outgoing_neighbor_ids, incoming_neighbor_ids) from the cached
    edge list, or ([], []) if no edge cache has been written yet."""
    import pandas as pd
    path = _edges_cache_path()
    if not path.is_file():
        return [], []
    edges = pd.read_csv(path)
    out_ids = edges.loc[edges.txId1 == transaction_id, "txId2"].tolist()
    in_ids = edges.loc[edges.txId2 == transaction_id, "txId1"].tolist()
    return out_ids, in_ids


@router.get("/{transaction_id}", response_model=TransactionDetail)
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.transaction_id == transaction_id).first()
    if tx is None:
        raise HTTPException(404, f"Transaction {transaction_id} not found.")
    p = tx.prediction
    inv = tx.investigation
    out_ids, in_ids = _neighbor_rows(transaction_id)
    connected = sorted(set(out_ids) | set(in_ids))
    return TransactionDetail(
        transaction_id=tx.transaction_id, time_step=tx.time_step, original_label=tx.original_label,
        predicted_label=p.predicted_label if p else None,
        illicit_probability=p.illicit_probability if p else None,
        risk_score=p.risk_score if p else None, risk_level=p.risk_level if p else None,
        out_degree=tx.out_degree, in_degree=tx.in_degree, illicit_neighbors=tx.illicit_neighbors,
        investigation_status=inv.status if inv else "unreviewed",
        model_name=p.model_name if p else None, split=tx.split,
        explanation=p.explanation if p else None, connected_transactions=connected,
        notes=inv.notes if inv else None)


@router.get("/{transaction_id}/neighbors", response_model=NeighborsResponse)
def get_neighbors(transaction_id: int, db: Session = Depends(get_db)):
    """Incoming/outgoing graph neighbors from the cached Elliptic edge list.
    Returns an empty, clearly-labelled result if no edge cache exists yet."""
    tx = db.query(Transaction).filter(Transaction.transaction_id == transaction_id).first()
    if tx is None:
        raise HTTPException(404, f"Transaction {transaction_id} not found.")

    out_ids, in_ids = _neighbor_rows(transaction_id)
    all_ids = sorted(set(out_ids) | set(in_ids))
    if not all_ids:
        return NeighborsResponse(transaction_id=transaction_id, neighbors=[])

    rows = (db.query(Transaction, Prediction)
           .outerjoin(Prediction, Transaction.transaction_id == Prediction.transaction_id)
           .filter(Transaction.transaction_id.in_(all_ids)).all())
    by_id = {t.transaction_id: (t, p) for t, p in rows}
    neighbors = []
    for nid in out_ids:
        if nid in by_id:
            t, p = by_id[nid]
            neighbors.append(NeighborOut(transaction_id=nid, direction="outgoing",
                                        original_label=t.original_label,
                                        predicted_label=p.predicted_label if p else None,
                                        risk_level=p.risk_level if p else None))
    for nid in in_ids:
        if nid in by_id:
            t, p = by_id[nid]
            neighbors.append(NeighborOut(transaction_id=nid, direction="incoming",
                                        original_label=t.original_label,
                                        predicted_label=p.predicted_label if p else None,
                                        risk_level=p.risk_level if p else None))
    return NeighborsResponse(transaction_id=transaction_id, neighbors=neighbors)
