import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Download, ArrowUpDown } from "lucide-react";
import { api } from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import RiskBadge from "../components/RiskBadge";
import LabelBadge from "../components/LabelBadge";

const LABELS = ["", "illicit", "licit", "unknown"];
const RISK_LEVELS = ["", "Low", "Medium", "High", "Critical"];

export default function TransactionMonitor() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") || 1);
  const search = params.get("search") || "";
  const label = params.get("label") || "";
  const riskLevel = params.get("risk_level") || "";
  const timeStep = params.get("time_step") || "";
  const sortBy = params.get("sort_by") || "transaction_id";
  const sortDir = params.get("sort_dir") || "asc";

  const [state, setState] = useState({ loading: true, error: null });
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [searchInput, setSearchInput] = useState(search);

  const query = useMemo(
    () => ({ page, page_size: 25, search, label, risk_level: riskLevel, time_step: timeStep, sort_by: sortBy, sort_dir: sortDir }),
    [page, search, label, riskLevel, timeStep, sortBy, sortDir]
  );

  useEffect(() => {
    setState({ loading: true, error: null });
    api
      .listTransactions(query)
      .then((d) => {
        setData(d);
        setState({ loading: false, error: null });
      })
      .catch((e) => setState({ loading: false, error: e.message }));
  }, [query]);

  function update(patch) {
    const next = new URLSearchParams(params);
    Object.entries({ ...patch, page: patch.page ?? 1 }).forEach(([k, v]) => {
      if (v) next.set(k, v);
      else next.delete(k);
    });
    setParams(next);
  }

  function toggleSort(col) {
    if (sortBy === col) update({ sort_by: col, sort_dir: sortDir === "asc" ? "desc" : "asc" });
    else update({ sort_by: col, sort_dir: "asc" });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Transaction Monitor</h1>
          <p className="text-xs text-text-secondary mt-1">
            Browse, filter, and investigate transactions from the loaded dataset.
          </p>
        </div>
        <a href={api.exportTransactionsUrl({ label, risk_level: riskLevel, time_step: timeStep })} className="btn-secondary flex items-center gap-2">
          <Download size={14} /> Export CSV
        </a>
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update({ search: searchInput });
          }}
          className="flex-1 min-w-[180px]"
        >
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by transaction ID..."
            className="input-field w-full"
          />
        </form>
        <select value={label} onChange={(e) => update({ label: e.target.value })} className="input-field">
          {LABELS.map((l) => (
            <option key={l} value={l}>
              {l ? l[0].toUpperCase() + l.slice(1) : "All labels"}
            </option>
          ))}
        </select>
        <select value={riskLevel} onChange={(e) => update({ risk_level: e.target.value })} className="input-field">
          {RISK_LEVELS.map((r) => (
            <option key={r} value={r}>
              {r || "All risk levels"}
            </option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Time step"
          value={timeStep}
          onChange={(e) => update({ time_step: e.target.value })}
          className="input-field w-28"
        />
      </div>

      {state.loading ? (
        <LoadingSpinner label="Loading transactions..." />
      ) : state.error ? (
        <ErrorState message={state.error} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No transactions match these filters" description="Try widening your search or clearing a filter." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary text-xs border-b border-[#1E293B] bg-[#0D1424]/60">
                  <Th label="Transaction ID" col="transaction_id" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Time Step" col="time_step" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  <th className="py-2.5 px-3 font-medium">Dataset Label</th>
                  <th className="py-2.5 px-3 font-medium">Predicted</th>
                  <th className="py-2.5 px-3 font-medium">Fraud Probability</th>
                  <Th label="Risk Score" col="risk_score" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  <th className="py-2.5 px-3 font-medium">Risk Level</th>
                  <th className="py-2.5 px-3 font-medium">Investigation</th>
                  <th className="py-2.5 px-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((t) => (
                  <tr key={t.transaction_id} className="border-b border-[#1E293B]/60 hover:bg-[#162034]">
                    <td className="py-2.5 px-3 font-mono text-xs">{t.transaction_id}</td>
                    <td className="py-2.5 px-3 text-text-secondary">{t.time_step}</td>
                    <td className="py-2.5 px-3"><LabelBadge label={t.original_label} /></td>
                    <td className="py-2.5 px-3"><LabelBadge label={t.predicted_label} /></td>
                    <td className="py-2.5 px-3 tabular-nums">
                      {t.illicit_probability != null ? `${(t.illicit_probability * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">{t.risk_score != null ? t.risk_score.toFixed(1) : "—"}</td>
                    <td className="py-2.5 px-3"><RiskBadge level={t.risk_level} /></td>
                    <td className="py-2.5 px-3 text-text-secondary capitalize">{t.investigation_status}</td>
                    <td className="py-2.5 px-3">
                      <Link to={`/transactions/${t.transaction_id}`} className="text-primary text-xs hover:underline">
                        View
                      </Link>
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

function Th({ label, col, sortBy, sortDir, onSort }) {
  const active = sortBy === col;
  return (
    <th className="py-2.5 px-3 font-medium cursor-pointer select-none" onClick={() => onSort(col)}>
      <span className={`inline-flex items-center gap-1 ${active ? "text-primary" : ""}`}>
        {label}
        <ArrowUpDown size={11} className={active && sortDir === "desc" ? "rotate-180" : ""} />
      </span>
    </th>
  );
}
