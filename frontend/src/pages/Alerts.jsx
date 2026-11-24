import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { RefreshCcw } from "lucide-react";
import { api } from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import RiskBadge from "../components/RiskBadge";
import LabelBadge from "../components/LabelBadge";

const SEVERITIES = ["", "Critical", "High", "Medium", "Low"];
const STATUSES = ["", "open", "acknowledged", "resolved"];

export default function Alerts() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") || 1);
  const severity = params.get("severity") || "";
  const status = params.get("status") || "";
  const search = params.get("search") || "";

  const [state, setState] = useState({ loading: true, error: null });
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [regenerating, setRegenerating] = useState(false);

  const query = useMemo(() => ({ page, page_size: 20, severity, status, search }), [page, severity, status, search]);

  useEffect(() => {
    load();
  }, [query]);

  function load() {
    setState({ loading: true, error: null });
    api
      .listAlerts(query)
      .then((d) => setState({ loading: false, error: null }) || setData(d))
      .catch((e) => setState({ loading: false, error: e.message }));
  }

  function update(patch) {
    const next = new URLSearchParams(params);
    Object.entries({ ...patch, page: patch.page ?? 1 }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next);
  }

  async function setStatus(alertId, newStatus) {
    await api.updateAlert(alertId, newStatus);
    load();
  }

  async function regenerate() {
    setRegenerating(true);
    try {
      await api.regenerateAlerts();
      load();
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Suspicious Activity Alerts</h1>
          <p className="text-xs text-text-secondary mt-1">
            Generated from model predictions and risk thresholds — never from an "unknown" label alone.
          </p>
        </div>
        <button onClick={regenerate} disabled={regenerating} className="btn-secondary flex items-center gap-2 disabled:opacity-60">
          <RefreshCcw size={14} className={regenerating ? "animate-spin" : ""} /> Regenerate Alerts
        </button>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <input
          defaultValue={search}
          onKeyDown={(e) => e.key === "Enter" && update({ search: e.target.value })}
          placeholder="Search by transaction ID (press Enter)..."
          className="input-field flex-1 min-w-[180px]"
        />
        <select value={severity} onChange={(e) => update({ severity: e.target.value })} className="input-field">
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s || "All severities"}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => update({ status: e.target.value })} className="input-field">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? s[0].toUpperCase() + s.slice(1) : "All statuses"}
            </option>
          ))}
        </select>
      </div>

      {state.loading ? (
        <LoadingSpinner label="Loading alerts..." />
      ) : state.error ? (
        <ErrorState message={state.error} onRetry={load} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No alerts match these filters" description="Train a model and regenerate alerts, or widen your filters." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary text-xs border-b border-[#1E293B] bg-[#0D1424]/60">
                  <th className="py-2.5 px-3 font-medium">Transaction ID</th>
                  <th className="py-2.5 px-3 font-medium">Risk Score</th>
                  <th className="py-2.5 px-3 font-medium">Predicted</th>
                  <th className="py-2.5 px-3 font-medium">Original Label</th>
                  <th className="py-2.5 px-3 font-medium">Time Step</th>
                  <th className="py-2.5 px-3 font-medium">Severity</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium">Created</th>
                  <th className="py-2.5 px-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id} className="border-b border-[#1E293B]/60 hover:bg-[#162034]">
                    <td className="py-2.5 px-3">
                      <Link to={`/transactions/${a.transaction_id}`} className="text-primary font-mono text-xs hover:underline">
                        {a.transaction_id}
                      </Link>
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">{a.risk_score.toFixed(1)}</td>
                    <td className="py-2.5 px-3"><LabelBadge label={a.predicted_label} /></td>
                    <td className="py-2.5 px-3"><LabelBadge label={a.original_label} /></td>
                    <td className="py-2.5 px-3 text-text-secondary">{a.time_step}</td>
                    <td className="py-2.5 px-3"><RiskBadge level={a.severity} /></td>
                    <td className="py-2.5 px-3 capitalize text-text-secondary">{a.status}</td>
                    <td className="py-2.5 px-3 text-text-secondary text-xs">{new Date(a.created_at).toLocaleDateString()}</td>
                    <td className="py-2.5 px-3">
                      {a.status !== "acknowledged" && a.status !== "resolved" && (
                        <button onClick={() => setStatus(a.id, "acknowledged")} className="text-xs text-primary hover:underline mr-2">
                          Acknowledge
                        </button>
                      )}
                      {a.status !== "resolved" && (
                        <button onClick={() => setStatus(a.id, "resolved")} className="text-xs text-success hover:underline">
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3">
            <Pagination page={data.page} pages={data.pages} total={data.total} onPageChange={(p) => update({ page: p })} />
          </div>
        </div>
      )}
    </div>
  );
}
