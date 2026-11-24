from __future__ import annotations

import json
import shutil
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.ml.elliptic_pipeline import CLASSES_FILE, EDGES_FILE, FEATURES_FILE, check_files

router = APIRouter(prefix="/api/dataset", tags=["dataset"])
RAW_DIR = Path(__file__).resolve().parents[3] / "data" / "raw"
PROCESSED_DIR = Path(__file__).resolve().parents[3] / "data" / "processed"
REQUIRED = (FEATURES_FILE, CLASSES_FILE, EDGES_FILE)


@router.get("/status")
def dataset_status():
    """Tells the frontend which required files are present, and whether a
    dataset has actually been loaded into the database yet."""
    present = check_files(RAW_DIR)
    summary_path = PROCESSED_DIR / "dataset_summary.json"
    summary = json.loads(summary_path.read_text()) if summary_path.is_file() else None
    return {"loaded": summary is not None, "required_files": present,
           "all_files_present": all(present.values()), "summary": summary,
           "required_file_names": list(REQUIRED)}


@router.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """Accepts one of the three required Elliptic CSVs at a time, saved by its
    own filename. Rejects anything that isn't one of the three expected names,
    rather than silently accepting and mismatching columns."""
    if file.filename not in REQUIRED:
        raise HTTPException(400, f"Unexpected file '{file.filename}'. Expected one of: "
                            f"{', '.join(REQUIRED)}.")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    dest = RAW_DIR / file.filename
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    present = check_files(RAW_DIR)
    return {"saved": file.filename, "size_bytes": dest.stat().st_size,
           "all_files_present": all(present.values()), "required_files": present}


@router.delete("/reset")
def reset_dataset(confirm: bool = False):
    """Deletes uploaded raw files, processed outputs, and trained models.
    Requires ?confirm=true; this does not touch the SQLite database itself --
    use a fresh DB file if you also want the loaded rows cleared."""
    if not confirm:
        raise HTTPException(400, "Pass ?confirm=true to confirm this irreversible reset.")
    models_dir = Path(__file__).resolve().parents[3] / "ml_models"
    removed = []
    for d in (RAW_DIR, PROCESSED_DIR, models_dir):
        if d.is_dir():
            for f in d.iterdir():
                if f.name != ".gitkeep" and f.is_file():
                    f.unlink()
                    removed.append(str(f.relative_to(d.parent.parent)))
    return {"removed": removed}
