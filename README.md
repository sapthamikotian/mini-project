<<<<<<< HEAD
# Bitcoin Sentinel

AI-powered Bitcoin transaction fraud detection and monitoring, built on the
**Elliptic Bitcoin Transaction Dataset**. This is an academic AIML project: it
analyzes a historical research dataset, not live blockchain data. Nothing in
this app should be read as proof that a transaction is actually fraudulent —
risk scores are model estimates.

## What's real here

- A genuine ML pipeline (Logistic Regression, Decision Tree, Random Forest)
  trained on the real Elliptic dataset, with a time-aware train/val/test split
  that prevents data leakage, class-imbalance handling, and honest evaluation
  focused on illicit-class precision/recall (not just accuracy).
- A FastAPI backend with a real SQLite database (SQLAlchemy models), REST
  endpoints for every dashboard feature, server-side pagination, and CSV/JSON
  report export.
- A React + Vite + Tailwind frontend that reads every number from the backend
  API — nothing is hardcoded, and there is no fake data path mixed into real
  results.

## Project structure

```
bitcoin-sentinel/
  backend/
    app/
      api/          FastAPI routers (dashboard, transactions, alerts, analytics, model, dataset, reports)
      database/     SQLAlchemy engine/session + init
      models/       ORM models (6 tables)
      schemas/       Pydantic request/response schemas
      services/      data loading, alert generation, ML model caching + training
      ml/            elliptic_pipeline.py -- the actual ML pipeline
      main.py         FastAPI app
    tests/
      make_synthetic_elliptic.py   generates FAKE data for smoke-testing only
    requirements.txt
  frontend/
    src/
      pages/          Overview, Transaction Monitor, AI Fraud Detection,
                      Network Analysis, Alerts, Analytics, Reports, Settings
      components/, charts/, layouts/, services/api.js
    package.json
  data/
    raw/              put the 3 Elliptic CSVs here
    processed/        pipeline outputs (predictions.csv, dataset_summary.json, edges_cache.csv)
  ml_models/          trained .joblib models + metrics.json
  reports/            (reserved for any file-based report exports you add)
```

## 1. Get the dataset

Download the **Elliptic Data Set** (`ellipticco/elliptic-data-set`) from
Kaggle and place these three files in `data/raw/`:

- `elliptic_txs_features.csv`
- `elliptic_txs_classes.csv`
- `elliptic_txs_edgelist.csv`

(You can also upload them through the app's Settings page once the backend
is running.)

## 2. Backend setup

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
```

Train the models (takes a few minutes; `--n-trees 100` is faster for testing):

```bash
python app/ml/elliptic_pipeline.py --n-trees 300
```

This writes `ml_models/*.joblib`, `ml_models/metrics.json`,
`data/processed/predictions.csv`, and `data/processed/edges_cache.csv`.

Start the API:

```bash
uvicorn app.main:app --reload --port 8000
```

Swagger docs: http://localhost:8000/docs

Load the trained results and generate alerts into the database (you can also
trigger training from the app's "AI Fraud Detection" page, which does this
automatically when it finishes):

```bash
curl -X POST http://localhost:8000/api/model/train \
  -H "Content-Type: application/json" \
  -d '{"train_end": 29, "val_end": 34, "default_model": "random_forest", "n_trees": 300, "seed": 42}'
```

Poll progress with `GET /api/model/train/status`.

## 3. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_BASE_URL defaults to http://localhost:8000
npm run dev
```

Open http://localhost:5173.

## Smoke-testing without the real dataset

`backend/tests/make_synthetic_elliptic.py` generates a small synthetic
dataset in the Elliptic file format so you can verify the pipeline and API
wiring end to end:

```bash
python backend/tests/make_synthetic_elliptic.py /tmp/synth
python backend/app/ml/elliptic_pipeline.py --raw-dir /tmp/synth --n-trees 100
```

**Never copy synthetic output into `data/raw/` or report its metrics as
real results** — it exists only to test that the code runs.

## Key design decisions

- **Original labels are never overwritten.** `original_label` (illicit /
  licit / unknown) and `predicted_label` are stored in separate columns.
  Unknown transactions are excluded from training/evaluation but still
  scored by the model.
- **Time-aware split.** Training uses the earliest time steps, validation the
  next band, and testing the latest — never shuffled — so the model is
  evaluated only on data that comes after what it was trained on. The
  imputer/scaler live inside the sklearn `Pipeline` so they're fit on
  training rows only.
- **Risk score = 100 × P(illicit).** Banded as Low (0–24), Medium (25–49),
  High (50–74), Critical (75–100). This is an estimate, not a verdict.
- **Alerts require both a predicted-illicit label and a risk score ≥ 25.** A
  transaction is never alerted purely because its original label is unknown.
- **Transaction IDs are anonymized graph node IDs**, not real Bitcoin wallet
  addresses — the UI says so wherever network/graph data is shown.
- **No fabricated data.** If a dataset isn't loaded, the dashboard shows an
  empty state explaining what's missing rather than falling back to fake
  numbers, and demo data (if you choose to generate any) is never mixed into
  real metrics.

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/dashboard/stats` | Summary cards |
| GET | `/api/transactions` | Paginated, filterable, sortable transaction list |
| GET | `/api/transactions/{id}` | Transaction detail + explanation |
| GET | `/api/transactions/{id}/neighbors` | Graph neighbors |
| GET | `/api/transactions/export` | CSV export of filtered transactions |
| GET | `/api/alerts` | Paginated alerts |
| PATCH | `/api/alerts/{id}` | Acknowledge / resolve |
| POST | `/api/alerts/generate` | Re-scan predictions and (re)create alerts |
| GET | `/api/analytics/classification` \| `/time-series` \| `/risk-distribution` \| `/model-performance` \| `/feature-importance` | Analytics data |
| POST | `/api/model/train` | Kick off training (background job) |
| GET | `/api/model/train/status` | Poll training progress |
| POST | `/api/model/predict` | Score a raw feature vector |
| GET | `/api/model/metrics` | Full metrics.json |
| GET | `/api/dataset/status` \| POST `/upload` \| DELETE `/reset` | Dataset management |
| GET | `/api/reports/transactions` \| `/alerts` \| `/summary` | Report exports |

## Known limitations / what to harden before production

- This was built and syntax-checked in a sandboxed environment without
  network access, so the backend has **not** been run end-to-end against a
  live `uvicorn` server or against the real Elliptic dataset. Run it locally
  and fix anything that surfaces — the code is complete, not a placeholder,
  but a first real run can still turn up integration issues.
- `explain_prediction` is a simple heuristic (global feature importance ×
  how unusual the value is), not SHAP. Swap in `shap.TreeExplainer` for
  rigorous per-prediction attribution if your coursework requires it.
- The edge list is cached as a flat CSV (`data/processed/edges_cache.csv`)
  and loaded fully into memory per `/neighbors` request. Fine for the
  ~200k-row Elliptic dataset; move to a proper graph store for anything
  larger.
- There's no authentication. Add it before deploying this anywhere multi-user.
=======
# mini-project
>>>>>>> 87d2ad70e9c98d3ad689cb04c982b5df50d4a362
