from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.database.session import SessionLocal
from app.schemas.schemas import PredictRequest, PredictResponse, TrainingStatus, TrainRequest
from app.services import data_loader, ml_service
from app.services.alerts_service import generate_alerts

router = APIRouter(prefix="/api/model", tags=["model"])
MODELS_DIR = Path(__file__).resolve().parents[3] / "ml_models"
PROCESSED_DIR = Path(__file__).resolve().parents[3] / "data" / "processed"


@router.post("/train", response_model=TrainingStatus)
def train(req: TrainRequest, background_tasks: BackgroundTasks):
    """
    Starts training in the background (it can take minutes on 200k+ rows) and
    returns immediately. Poll GET /api/model/train/status for progress. Once
    finished, loads predictions/metrics into SQLite and regenerates alerts.
    """
    result = ml_service.start_training(req.train_end, req.val_end, req.default_model,
                                       req.n_trees, req.seed)
    if not result["started"]:
        raise HTTPException(409, result["reason"])
    background_tasks.add_task(_load_after_training)
    return TrainingStatus(state="running", stage="Starting", percent=0)


def _load_after_training() -> None:
    """Polls until the background training thread finishes, then loads results
    into the database and regenerates alerts, using its own DB session (the
    request's session is already closed by the time this background task runs)."""
    import time
    for _ in range(3600):  # up to 1 hour
        status = ml_service.training_status()
        if status["state"] in ("done", "failed"):
            break
        time.sleep(1)
    if ml_service.training_status()["state"] != "done":
        return
    db = SessionLocal()
    try:
        data_loader.load_predictions(db, PROCESSED_DIR)
        data_loader.load_model_metrics(db, MODELS_DIR)
        generate_alerts(db)
    finally:
        db.close()


@router.get("/train/status", response_model=TrainingStatus)
def train_status():
    return ml_service.training_status()


@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    model_name = ml_service.default_model_name() or "random_forest"
    try:
        result = ml_service.predict_one(model_name, req.features)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    return PredictResponse(**result)


@router.get("/metrics")
def metrics():
    path = MODELS_DIR / "metrics.json"
    if not path.is_file():
        raise HTTPException(404, "No trained model yet. POST /api/model/train first.")
    return json.loads(path.read_text())
