"""
ORM models for the six tables described in the project spec:
transactions, predictions, alerts, investigation_status, model_metrics,
dataset_metadata.

`Transaction` stores only what the Elliptic dataset actually provides
(transaction id, time step, original label, graph stats). It never invents
amounts, addresses, or timestamps that aren't in the source data.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (Boolean, DateTime, Float, ForeignKey, Index, Integer, JSON,
                        String, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Transaction(Base):
    """One row per Elliptic transaction. `transaction_id` is the dataset's txId,
    an anonymized graph node id -- NOT a real Bitcoin wallet address."""
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[int] = mapped_column(Integer, unique=True, index=True, nullable=False)
    time_step: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    original_label: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    split: Mapped[str] = mapped_column(String(8), nullable=False, default="train")
    out_degree: Mapped[int] = mapped_column(Integer, default=0)
    in_degree: Mapped[int] = mapped_column(Integer, default=0)
    illicit_neighbors: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    prediction = relationship("Prediction", back_populates="transaction", uselist=False,
                              cascade="all, delete-orphan")
    investigation = relationship("InvestigationStatus", back_populates="transaction",
                                 uselist=False, cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="transaction", cascade="all, delete-orphan")

    __table_args__ = (Index("ix_tx_label_step", "original_label", "time_step"),)


class Prediction(Base):
    """ML output for one transaction. Kept separate from `original_label` so
    the dataset's ground truth is never overwritten by a model prediction."""
    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.transaction_id", ondelete="CASCADE"), unique=True, index=True)
    model_name: Mapped[str] = mapped_column(String(40), nullable=False)
    predicted_label: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    illicit_probability: Mapped[float] = mapped_column(Float, nullable=False)
    risk_score: Mapped[float] = mapped_column(Float, index=True, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    explanation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    predicted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    transaction = relationship("Transaction", back_populates="prediction")


class InvestigationStatus(Base):
    """Analyst workflow state for a transaction (separate from the alert queue)."""
    __tablename__ = "investigation_status"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.transaction_id", ondelete="CASCADE"), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="unreviewed")  # unreviewed/reviewing/cleared/confirmed
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    transaction = relationship("Transaction", back_populates="investigation")


class Alert(Base):
    """A suspicious-activity alert generated from a prediction + risk threshold.
    Never generated solely because a transaction's label is 'unknown'."""
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.transaction_id", ondelete="CASCADE"), index=True)
    severity: Mapped[str] = mapped_column(String(10), index=True, nullable=False)  # Critical/High/Medium/Low
    risk_score: Mapped[float] = mapped_column(Float, nullable=False)
    predicted_label: Mapped[str] = mapped_column(String(10), nullable=False)
    original_label: Mapped[str] = mapped_column(String(10), nullable=False)
    time_step: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(15), default="open", index=True)  # open/acknowledged/resolved
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    transaction = relationship("Transaction", back_populates="alerts")

    __table_args__ = (UniqueConstraint("transaction_id", name="uq_alert_per_tx"),
                      Index("ix_alert_sev_status", "severity", "status"))


class ModelMetrics(Base):
    """One row per trained model per run, mirroring ml_models/metrics.json."""
    __tablename__ = "model_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    model_name: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    accuracy: Mapped[float] = mapped_column(Float)
    illicit_precision: Mapped[float] = mapped_column(Float)
    illicit_recall: Mapped[float] = mapped_column(Float)
    illicit_f1: Mapped[float] = mapped_column(Float)
    roc_auc: Mapped[float | None] = mapped_column(Float, nullable=True)
    pr_auc: Mapped[float | None] = mapped_column(Float, nullable=True)
    confusion_matrix: Mapped[dict] = mapped_column(JSON)
    split: Mapped[str] = mapped_column(String(10), default="test")  # val or test
    trained_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    __table_args__ = (UniqueConstraint("run_id", "model_name", "split", name="uq_metric_run_model_split"),)


class DatasetMetadata(Base):
    """Summary of the most recently loaded dataset (mirrors dataset_summary.json)."""
    __tablename__ = "dataset_metadata"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(10), default="real")  # real or demo
    total_transactions: Mapped[int] = mapped_column(Integer)
    illicit_count: Mapped[int] = mapped_column(Integer)
    licit_count: Mapped[int] = mapped_column(Integer)
    unknown_count: Mapped[int] = mapped_column(Integer)
    total_edges: Mapped[int] = mapped_column(Integer)
    time_step_min: Mapped[int] = mapped_column(Integer)
    time_step_max: Mapped[int] = mapped_column(Integer)
    warnings: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    loaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
