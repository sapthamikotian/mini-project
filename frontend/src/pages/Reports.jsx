import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { api } from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";

export default function Reports() {
  const [state, setState] = useState({ loading: true, error: null });
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setState({ loading: true, error: null });
    api
      .getReportSummary()
      .then((d) => {
        setSummary(d);
        setState({ loading: false, error: null });
      })
      .catch((e) => setState({ loading: false, error: e.status === 404 ? null : e.message }));
  }

  if (state.loading) return <LoadingSpinner label="Loading reports..." />;
  if (state.error) return <ErrorState message={state.error} onRetry={load} />;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-xs text-text-secondary mt-1">
          Export transaction records, alerts, and model evaluation summaries.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReportCard
          title="Transaction Records"
          description="Full export of transactions with their latest prediction and risk score."
          href={api.reportTransactionsUrl()}
        />
        <ReportCard
          title="Suspicious Activity Alerts"
          description="All generated alerts, including severity, status, and timestamps."
          href={api.reportAlertsUrl()}
        />
      </div>

      {!summary ? (
        <EmptyState title="No dataset loaded" description="Load the dataset and train a model to generate a summary report." />
      ) : (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <FileText size={16} className="text-primary" />
            <h2 className="text-sm font-semibold">{summary.report_title}</h2>
          </div>
          <p className="text-[11px] text-text-secondary mb-5">Generated {new Date(summary.generated_at).toLocaleString()}</p>

          <Section title="Dataset Information">
            <Row label="Source" value={summary.dataset.source === "real" ? "Elliptic Bitcoin Transaction Dataset" : "Demo (synthetic)"} />
            <Row label="Total transactions" value={summary.dataset.total_transactions.toLocaleString()} />
            <Row label="Illicit / Licit / Unknown" value={`${summary.dataset.illicit.toLocaleString()} / ${summary.dataset.licit.toLocaleString()} / ${summary.dataset.unknown.toLocaleString()}`} />
            <Row label="Total edges" value={summary.dataset.total_edges.toLocaleString()} />
            <Row label="Time step range" value={summary.dataset.time_step_range.join(" – ")} />
          </Section>

          <Section title="Model Performance (test set)">
            {summary.model_performance.length === 0 ? (
              <p className="text-xs text-text-secondary">No trained model yet.</p>
            ) : (
              summary.model_performance.map((m) => (
                <div key={m.model} className="text-sm py-1.5 border-b border-[#1E293B]/60 last:border-0 flex justify-between">
                  <span className="capitalize">
                    {m.model.replace(/_/g, " ")} {m.is_default && <span className="text-primary text-xs">(default)</span>}
                  </span>
                  <span className="tabular-nums text-text-secondary">
                    acc {(m.accuracy * 100).toFixed(1)}% · illicit F1 {(m.illicit_f1 * 100).toFixed(1)}%
                  </span>
                </div>
              ))
            )}
          </Section>

          <Section title="Suspicious Activity Summary">
            <Row label="Total alerts" value={summary.suspicious_activity.total_alerts.toLocaleString()} />
            <Row label="Open alerts" value={summary.suspicious_activity.open_alerts.toLocaleString()} />
            {Object.entries(summary.suspicious_activity.by_severity).map(([sev, count]) => (
              <Row key={sev} label={`${sev} severity`} value={count.toLocaleString()} />
            ))}
          </Section>

          <p className="text-[11px] text-text-secondary mt-4 pt-4 border-t border-[#1E293B]">{summary.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

function ReportCard({ title, description, href }) {
  return (
    <div className="card p-5 flex flex-col justify-between">
      <div>
        <h3 className="text-sm font-medium mb-1">{title}</h3>
        <p className="text-xs text-text-secondary mb-4">{description}</p>
      </div>
      <a href={href} className="btn-secondary inline-flex items-center gap-2 self-start">
        <Download size={14} /> Export CSV
      </a>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm py-1 border-b border-[#1E293B]/60 last:border-0">
      <span className="text-text-secondary">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
