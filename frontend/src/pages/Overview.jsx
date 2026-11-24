import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, CheckCircle2, ShieldAlert, HelpCircle, Flame } from "lucide-react";
import { api } from "../services/api";
import StatCard from "../components/StatCard";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import RiskBadge from "../components/RiskBadge";
import LabelBadge from "../components/LabelBadge";
import ClassificationChart from "../charts/ClassificationChart";
import TimeSeriesChart from "../charts/TimeSeriesChart";
import FraudTrendChart from "../charts/FraudTrendChart";
import RiskDistributionChart from "../charts/RiskDistributionChart";
import ModelPerformanceChart from "../charts/ModelPerformanceChart";

export default function Overview() {
  const [state, setState] = useState({ loading: true, error: null });
  const [stats, setStats] = useState(null);
  const [classification, setClassification] = useState([]);
  const [timeSeries, setTimeSeries] = useState([]);
  const [riskDist, setRiskDist] = useState([]);
  const [modelPerf, setModelPerf] = useState([]);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setState({ loading: true, error: null });
    try {
      const s = await api.getDashboardStats();
      setStats(s);
      if (s.dataset_loaded) {
        const [cls, ts, risk, perf, alerts] = await Promise.all([
          api.getClassification(),
          api.getTimeSeries(),
          api.getRiskDistribution(),
          api.getModelPerformance().catch(() => []),
          api.listAlerts({ page: 1, page_size: 8, sort_by: "created_at", sort_dir: "desc" }).catch(() => ({ items: [] })),
        ]);
        setClassification(cls);
        setTimeSeries(ts);
        setRiskDist(risk);
        setModelPerf(perf);
        setRecent(alerts.items);
      }
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: e.message });
    }
  }

  if (state.loading) return <LoadingSpinner label="Loading dashboard..." />;
  if (state.error) return <ErrorState message={state.error} onRetry={load} />;

  if (!stats.dataset_loaded) {
    return (
      <EmptyState
        title="No dataset loaded"
        description="Upload the Elliptic Bitcoin Transaction Dataset and train a model to populate the dashboard."
        action={
          <Link to="/settings" className="btn-primary">
            Go to Settings
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-xs text-text-secondary mt-1">
          Historical dataset analysis · Elliptic Bitcoin Transaction Dataset
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total Analyzed" value={stats.total_transactions.toLocaleString()} icon={Activity} tone="default" />
        <StatCard label="Legitimate" value={stats.legitimate.toLocaleString()} icon={CheckCircle2} tone="success" />
        <StatCard label="Illicit" value={stats.illicit.toLocaleString()} icon={ShieldAlert} tone="critical" />
        <StatCard label="Unknown" value={stats.unknown.toLocaleString()} icon={HelpCircle} tone="default" />
        <StatCard label="High-Risk Predictions" value={stats.high_risk_predictions.toLocaleString()} icon={Flame} tone="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card p-5 lg:col-span-1">
          <h2 className="text-sm font-medium mb-3">Transaction Classification</h2>
          <ClassificationChart data={classification} />
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-medium mb-3">Transaction Distribution Over Time</h2>
          <TimeSeriesChart data={timeSeries} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h2 className="text-sm font-medium mb-3">Fraud Detection Trend</h2>
          <FraudTrendChart data={timeSeries} />
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-medium mb-3">Risk Distribution</h2>
          <RiskDistributionChart data={riskDist} />
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">Model Performance (test set)</h2>
          <Link to="/analytics" className="text-xs text-primary hover:underline">
            View full analytics
          </Link>
        </div>
        {modelPerf.length ? (
          <ModelPerformanceChart data={modelPerf} />
        ) : (
          <p className="text-xs text-text-secondary py-6 text-center">
            No trained model yet. Train one from the AI Fraud Detection page.
          </p>
        )}
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-medium mb-3">Recent Suspicious Transactions</h2>
        {recent.length === 0 ? (
          <p className="text-xs text-text-secondary py-6 text-center">No alerts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary text-xs border-b border-[#1E293B]">
                  <th className="py-2 font-medium">Transaction ID</th>
                  <th className="py-2 font-medium">Time Step</th>
                  <th className="py-2 font-medium">Original Label</th>
                  <th className="py-2 font-medium">Predicted</th>
                  <th className="py-2 font-medium">Risk Score</th>
                  <th className="py-2 font-medium">Severity</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id} className="border-b border-[#1E293B]/60 hover:bg-[#162034]">
                    <td className="py-2">
                      <Link to={`/transactions/${a.transaction_id}`} className="text-primary hover:underline">
                        {a.transaction_id}
                      </Link>
                    </td>
                    <td className="py-2 text-text-secondary">{a.time_step}</td>
                    <td className="py-2"><LabelBadge label={a.original_label} /></td>
                    <td className="py-2"><LabelBadge label={a.predicted_label} /></td>
                    <td className="py-2 tabular-nums">{a.risk_score.toFixed(1)}</td>
                    <td className="py-2"><RiskBadge level={a.severity} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
