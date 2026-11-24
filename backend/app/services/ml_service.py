"""
Thin service layer around app.ml.elliptic_pipeline: caches loaded model bundles
in memory (so the API doesn't deserialize a joblib file on every request),
and runs training as a background job with file-based progress reporting.
"""
from __future__ import annotations

import json
import threading
import traceback
from pathlib import Path
from typing import Any

from app.ml.elliptic_pipeline import DatasetError, explain_prediction, load_bundle, predict_features, run

ROOT = Path(__file__).resolve().parents[3]
MODELS_DIR = ROOT / "ml_models"
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
PROGRESS_FILE = MODELS_DIR / "training_progress.json"

_bundle_cache: dict[str, Any] = {}
_train_lock = threading.Lock()
_train_thread: threading.Thread | None = None
_train_result: dict[str, Any] = {"state": "idle"}


def available_models() -> list[str]:
    return sorted(p.stem for p in MODELS_DIR.glob("*.joblib")) if MODELS_DIR.exists() else []


def get_bundle(model_name: str):
    if model_name not in _bundle_cache:
        path = MODELS_DIR / f"{model_name}.joblib"
        if not path.is_file():
            raise FileNotFoundError(f"No trained model '{model_name}' at {path}. Train first.")
        _bundle_cache[model_name] = load_bundle(path)
    return _bundle_cache[model_name]


def default_model_name() -> str | None:
    metrics_path = MODELS_DIR / "metrics.json"
    if not metrics_path.is_file():
        return None
    return json.loads(metrics_path.read_text()).get("default_model")


def predict_one(model_name: str, features: list[float]) -> dict:
    bundle = get_bundle(model_name)
    out = predict_features(bundle, features).iloc[0].to_dict()
    out["explanation"] = explain_prediction(bundle, features, top_k=5)
    out["model_name"] = model_name
    return out


def training_status() -> dict:
    with _train_lock:
        state = dict(_train_result)
    if PROGRESS_FILE.is_file() and state.get("state") == "running":
        try:
            prog = json.loads(PROGRESS_FILE.read_text())
            state.update(stage=prog.get("stage"), percent=prog.get("percent"))
        except json.JSONDecodeError:
            pass
    return state


def _train_worker(train_end: int, val_end: int, default_model: str, n_trees: int, seed: int) -> None:
    global _train_result
    try:
        summary = run(RAW_DIR, MODELS_DIR, PROCESSED_DIR, train_end, val_end,
                      default_model, n_trees, seed, PROGRESS_FILE)
        _bundle_cache.clear()
        with _train_lock:
            _train_result = {"state": "done", "stage": "Done", "percent": 100, "summary": summary}
    except DatasetError as e:
        with _train_lock:
            _train_result = {"state": "failed", "error": str(e)}
    except Exception:
        with _train_lock:
            _train_result = {"state": "failed", "error": traceback.format_exc(limit=3)}


def start_training(train_end: int, val_end: int, default_model: str, n_trees: int, seed: int) -> dict:
    """Kicks off training in a background thread. Returns immediately; poll
    training_status() for progress. Refuses to start a second run concurrently."""
    global _train_thread, _train_result
    with _train_lock:
        if _train_thread is not None and _train_thread.is_alive():
            return {"started": False, "reason": "A training run is already in progress."}
        _train_result = {"state": "running", "stage": "Starting", "percent": 0}
    _train_thread = threading.Thread(target=_train_worker,
                                     args=(train_end, val_end, default_model, n_trees, seed),
                                     daemon=True)
    _train_thread.start()
    return {"started": True}
