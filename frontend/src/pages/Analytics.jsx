import { useEffect, useState } from "react";
import { api } from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import ClassificationChart from "../charts/ClassificationChart";
import FraudTrendChart from "../charts/FraudTrendChart";
import RiskDistributionChart from "../charts/RiskDistributionChart";
import ModelPerformanceChart from "../charts/ModelPerformanceChart";
import ConfusionMatrix from "../charts/ConfusionMatrix";
import FeatureImportanceChart from "../charts/FeatureImportanceChart";

const MODEL_OPTIONS = ["random_forest", "decision_tree", "logistic_regression"];

export default function Analytics() {
  const [state, setState] = useState({ loading: true, error: null });
  const [classification, setClassification] = useState([]);
  const [timeSeries, setTimeSeries] = useState([]);
  const [riskDist, setRiskDist] = useState([]);
  const [modelPerf, setModelPerf] = useState([]);
  const [split, setSplit] = useState("test");
  const [importanceModel, setImportanceModel] = useState("random_forest");
  const [importance, setImportance] = useState([]);
  const [importanceError, setImportanceError] = useState(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    api.getModelPerformance(split).then(setModelPerf).catch(() => setModelPerf([]));
  }, [split]);

  useEffect(() => {
    api
      .getFeatureImportance(importanceModel)
      .then((d) => {
        setImportance(d);
        setImportanceError(null);
      })
      .catch((e) => setImportanceError(e.message));
  }, [importanceModel]);

  async function load() {
    setState({ loading: true, error: null });
    try {
      const [cls, ts, risk] = await Promise.all([
        api.getClassification(),
        api.getTimeSeries(),
        api.getRiskDistribution(),
      ]);
      setClassification(cls);
      setTimeSeries(ts);
      setRiskDist(risk);
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: e.message });
    }
  }

  if (state.loading) return <LoadingSpinner label="Loading analytics..." />;
  if (state.error) return <ErrorState message={state.error} onRetry={load} />;
  if (classification.length === 0) {
    return <EmptyState title="No dataset loaded" description="Load the dataset and train a model to see analytics." />;
  }

  const defaultRow = modelPerf.find((m) => m.is_default) || modelPerf[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-xs text-text-secondary mt-1">
          Advanced breakdowns of classification, risk, and model performance -- all computed from
          the loaded dataset and the most recently trained models.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h2 className="text-sm font-medium mb-3">Legitimate vs Illicit vs Unknown</h2>
          <ClassificationChart data={classification} />
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-medium mb-3">Risk Distribution</h2>
          <RiskDistributionChart data={riskDist} />
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-medium mb-3">Illicit Predictions Over Time</h2>
        <FraudTrendChart data={timeSeries} />
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-sm font-medium">Algorithm Performance Comparison</h2>
          <div className="flex gap-1 bg-[#0D1424] border border-[#1E293B] rounded-lg p-1">
            {["val", "test"].map((s) => (
              <button
                key={s}
                onClick={() => setSplit(s)}
                className={`px-3 py-1 text-xs rounded-md capitalize transition-colors ${
                  split === s ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {s === "val" ? "Validation" : "Test"}
              </button>
            ))}
          </div>
        </div>
        {modelPerf.length ? (
          <ModelPerformanceChart data={modelPerf} />
        ) : (
          <p className="text-xs text-text-secondary py-6 text-center">No trained model yet.</p>
        )}
      </div>

      {defaultRow && (
        <div className="card p-5">
          <h2 className="text-sm font-medium mb-4">
            Confusion Matrix — {defaultRow.model_name.replace(/_/g, " ")} ({split} split)
          </h2>
          <ConfusionMatrix matrix={defaultRow.confusion_matrix} />
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-sm font-medium">Feature Importance</h2>
          <select value={importanceModel} onChange={(e) => setImportanceModel(e.target.value)} className="input-field">
            {MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        {importanceError ? (
          <p className="text-xs text-text-secondary py-6 text-center">No feature importance available for this model yet.</p>
        ) : (
          <FeatureImportanceChart data={importance} />
        )}
      </div>
    </div>
  );
}
