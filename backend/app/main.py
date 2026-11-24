"""
BITCOIN SENTINEL backend entry point.

Run with:   uvicorn app.main:app --reload --port 8000   (from the backend/ directory)
Docs at:    http://localhost:8000/docs
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import alerts, analytics, dashboard, dataset, model, reports, transactions
from app.database.session import init_db

app = FastAPI(
    title="Bitcoin Sentinel API",
    description=("AI-powered Bitcoin transaction fraud detection and monitoring, built on the "
                "Elliptic Bitcoin Transaction Dataset. This analyzes a HISTORICAL research "
                "dataset -- it is not a live blockchain monitor."),
    version="1.0.0",
)

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                  allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def on_startup() -> None:
    init_db()  # safe: only creates tables that don't already exist


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok"}


for router in (dashboard.router, transactions.router, alerts.router, analytics.router,
              model.router, dataset.router, reports.router):
    app.include_router(router)
