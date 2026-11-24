"""
SMOKE-TEST ONLY. Writes a tiny SYNTHETIC dataset in the Elliptic file format so
the pipeline can be tested without the real data. Never put this in data/raw and
never report its metrics as real results.

    python tests/make_synthetic_elliptic.py OUT_DIR
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(0)
n, steps = 8000, 49
ids = rng.permutation(np.arange(100000, 100000 + n))
ts = np.sort(rng.integers(1, steps + 1, n))
lab = rng.choice(["1", "2", "unknown"], n, p=[0.03, 0.30, 0.67])
X = rng.normal(size=(n, 165)).astype(np.float32)
X[lab == "1", :12] += 1.5                       # make illicit weakly separable
pd.DataFrame(np.column_stack([ids, ts, X])).astype({0: "int64", 1: "int64"}) \
  .to_csv(out / "elliptic_txs_features.csv", header=False, index=False)
pd.DataFrame({"txId": ids, "class": lab}).to_csv(out / "elliptic_txs_classes.csv", index=False)
e = np.column_stack([rng.choice(ids, 12000), rng.choice(ids, 12000)])
e = np.vstack([e, e[:50]])                      # inject duplicate edges
pd.DataFrame(e, columns=["txId1", "txId2"]).to_csv(out / "elliptic_txs_edgelist.csv", index=False)
print("synthetic files written to", out)
