import { useEffect, useRef, useState } from "react";
import { PlayCircle, Loader2 } from "lucide-react";
import { api } from "../services/api";
import ModelPerformanceChart from "../charts/ModelPerformanceChart";
import ConfusionMatrix from "../charts/ConfusionMatrix";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";

export default function FraudDetection() {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);
  const [training, setTraining] = useState(null); // { state, stage, percent }
  const [form, setForm] = useState({ train_end: 29, val_end: 34, default_model: "random_forest", n_trees: 300, seed: 42 });
  const pollRef = useRef(null);

  useEffect(() => {
    refreshMetrics();
    return () => clearInterval(pollRef.current);
  }, []);

  function refreshMetrics() {
    api
      .getModelMetrics()
      .then(setMetrics)
      .catch((e) => setError(e.status === 404 ? null : e.message));
  }

  async function startTraining() {
    setError(null);
    try {
      await api.trainModel(form);
      setTraining({ state: "running", percent: 0, stage: "Starting" });
      pollRef.current = setInterval(async () => {
        const s = await api.getTrainStatus();
        setTraining(s);
        if (s.state === "done" || s.state === "failed") {
          clearInterval(pollRef.current);
          if (s.state === "done") refreshMetrics();
        }
      }, 2000);
    } catch (e) {
      setError(e.message);
    }
  }

  const testRows = metrics
    ? Object.entries(metrics.models).map(([name, m]) => ({ model_name: name, is_default: name === metrics.default_model, ...m.test }))
    : [];
  const defaultRow = testRows.find((r) => r.is_default);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">AI Fraud Detection</h1>
        <p className="text-xs text-text-secondary mt-1">
          Train and evaluate Logistic Regression, Decision Tree, and Random Forest classifiers on the
          Elliptic dataset with a time-aware split.
        </p>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-medium mb-4">Train Models</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <NumField label="Train end (step)" value={form.train_end} onChange={(v) => setForm({ ...form, train_end: v })} />
          <NumField label="Validation end (step)" value={form.val_end} onChange={(v) => setForm({ ...form, val_end: v })} />
          <NumField label="Trees (Random Forest)" value={form.n_trees} onChange={(v) => setForm({ ...form, n_trees: v })} />
          <NumField label="Random seed" value={form.seed} onChange={(v) => setForm({ ...form, seed: v })} />
          <div>
            <label className="text-[11px] text-text-secondary block mb-1">Default model</label>
            <select
              className="input-field w-full"
              value={form.default_model}
              onChange={(e) => setForm({ ...form, default_model: e.target.value })}
            >
              <option value="random_forest">Random Forest</option>
              <option value="decision_tree">Decision Tree</option>
              <option value="logistic_regression">Logistic Regression</option>
            </select>
          </div>
        </div>
        <button
          onClick={startTraining}
          disabled={training?.state === "running"}
          className="btn-primary flex items-center gap-2 disabled:opacity-60"
        >
          {training?.state === "running" ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />}
          {training?.state === "running" ? "Training..." : "Train Models"}
        </button>

        {training && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
              <span>{training.stage || training.state}</span>
              <span>{training.percent ?? 0}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#162034] rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${training.percent ?? 0}%` }} />
            </div>
            {training.state === "failed" && <p className="text-xs text-critical mt-2">{training.error}</p>}
          </div>
        )}
      </div>

      {error && <ErrorState message={error} />}

      {!metrics ? (
        <EmptyState title="No trained model yet" description="Run training above to see model performance and predictions." />
      ) : (
        <>
          <div className="card p-5">
            <h2 className="text-sm font-medium mb-4">Model Comparison (held-out test set)</h2>
            <ModelPerformanceChart data={testRows} />
            <p className="text-[11px] text-text-secondary mt-3">{metrics.disclaimer}</p>
          </div>

          {defaultRow && (
            <div className="card p-5">
              <h2 className="text-sm font-medium mb-4">
                Confusion Matrix — {defaultRow.model_name.replace(/_/g, " ")} (default model)
              </h2>
              <ConfusionMatrix matrix={defaultRow.confusion_matrix} />
            </div>
          )}

          <div className="card p-5">
            <h2 className="text-sm font-medium mb-2">Dataset Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <SummaryItem label="Total" value={metrics.dataset.total_transactions} />
              <SummaryItem label="Illicit" value={metrics.dataset.illicit} />
              <SummaryItem label="Licit" value={metrics.dataset.licit} />
              <SummaryItem label="Unknown" value={metrics.dataset.unknown} />
            </div>
            {metrics.dataset.warnings?.length > 0 && (
              <ul className="text-[11px] text-warning mt-3 list-disc list-inside space-y-1">
                {metrics.dataset.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function NumField({ label, value, onChange }) {
  return (
    <div>
      <label className="text-[11px] text-text-secondary block mb-1">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="input-field w-full" />
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div>
      <p className="text-[11px] text-text-secondary">{label}</p>
      <p className="text-base font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
