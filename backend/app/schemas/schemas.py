"""Pydantic schemas for API requests and responses."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

RISK_DISCLAIMER = ("Risk scores are model estimates derived from the illicit-class "
                   "probability. They are not proof of criminal activity.")

RiskLevel = Literal["Low", "Medium", "High", "Critical"]
Label = Literal["illicit", "licit", "unknown"]
Severity = Literal["Critical", "High", "Medium", "Low"]
AlertStatus = Literal["open", "acknowledged", "resolved"]
InvestigationState = Literal["unreviewed", "reviewing", "cleared", "confirmed"]


# ---------------------------------------------------------------------- #
# Transactions
# ---------------------------------------------------------------------- #
class TransactionOut(BaseModel):
    transaction_id: int
    time_step: int
    original_label: Label
    predicted_label: Label | None = None
    illicit_probability: float | None = None
    risk_score: float | None = None
    risk_level: RiskLevel | None = None
    out_degree: int
    in_degree: int
    illicit_neighbors: int
    investigation_status: InvestigationState = "unreviewed"

    class Config:
        from_attributes = True


class TransactionDetail(TransactionOut):
    model_name: str | None = None
    split: str
    explanation: list[dict[str, Any]] | None = None
    connected_transactions: list[int] = Field(default_factory=list)
    notes: str | None = None
    disclaimer: str = RISK_DISCLAIMER


class PaginatedTransactions(BaseModel):
    items: list[TransactionOut]
    total: int
    page: int
    page_size: int
    pages: int


class NeighborOut(BaseModel):
    transaction_id: int
    direction: Literal["incoming", "outgoing"]
    original_label: Label
    predicted_label: Label | None = None
    risk_level: RiskLevel | None = None


class NeighborsResponse(BaseModel):
    transaction_id: int
    neighbors: list[NeighborOut]
    disclaimer: str = ("Transaction IDs are anonymized dataset identifiers, not "
                       "real Bitcoin wallet addresses.")


# ---------------------------------------------------------------------- #
# Dashboard / analytics
# ---------------------------------------------------------------------- #
class DashboardStats(BaseModel):
    total_transactions: int
    legitimate: int
    illicit: int
    unknown: int
    high_risk_predictions: int
    dataset_loaded: bool
    dataset_source: str | None = None


class ClassificationBucket(BaseModel):
    label: str
    count: int


class TimeSeriesPoint(BaseModel):
    time_step: int
    total: int
    illicit_known: int
    illicit_predicted: int


class RiskDistributionBucket(BaseModel):
    level: RiskLevel
    count: int


class ModelPerformanceOut(BaseModel):
    model_name: str
    is_default: bool
    accuracy: float
    illicit_precision: float
    illicit_recall: float
    illicit_f1: float
    roc_auc: float | None
    pr_auc: float | None
    confusion_matrix: dict[str, Any]
    split: str


class FeatureImportanceItem(BaseModel):
    feature: str
    importance: float


# ---------------------------------------------------------------------- #
# Alerts
# ---------------------------------------------------------------------- #
class AlertOut(BaseModel):
    id: int
    transaction_id: int
    severity: Severity
    risk_score: float
    predicted_label: Label
    original_label: Label
    time_step: int
    status: AlertStatus
    created_at: datetime

    class Config:
        from_attributes = True


class PaginatedAlerts(BaseModel):
    items: list[AlertOut]
    total: int
    page: int
    page_size: int
    pages: int


class AlertUpdate(BaseModel):
    status: AlertStatus


# ---------------------------------------------------------------------- #
# Model training / prediction
# ---------------------------------------------------------------------- #
class TrainRequest(BaseModel):
    train_end: int = 29
    val_end: int = 34
    default_model: Literal["logistic_regression", "decision_tree", "random_forest"] = "random_forest"
    n_trees: int = 300
    seed: int = 42


class TrainingStatus(BaseModel):
    state: Literal["idle", "running", "done", "failed"]
    stage: str | None = None
    percent: int | None = None
    summary: dict[str, Any] | None = None
    error: str | None = None


class PredictRequest(BaseModel):
    """Raw feature vector in the same order the model was trained on."""
    features: list[float]


class PredictResponse(BaseModel):
    predicted_label: Label
    illicit_probability: float
    licit_probability: float
    risk_score: float
    risk_level: RiskLevel
    explanation: list[dict[str, Any]]
    model_name: str
    disclaimer: str = RISK_DISCLAIMER


# ---------------------------------------------------------------------- #
# Dataset
# ---------------------------------------------------------------------- #
class DatasetStatus(BaseModel):
    loaded: bool
    source: str | None = None
    required_files: dict[str, bool]
    summary: dict[str, Any] | None = None
