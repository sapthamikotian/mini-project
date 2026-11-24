import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Network } from "lucide-react";
import { api } from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorState from "../components/ErrorState";
import RiskBadge from "../components/RiskBadge";
import LabelBadge from "../components/LabelBadge";

export default function TransactionDetail() {
  const { id } = useParams();
  const [tx, setTx] = useState(null);
  const [state, setState] = useState({ loading: true, error: null });

  useEffect(() => {
    setState({ loading: true, error: null });
    api
      .getTransaction(id)
      .then((d) => {
        setTx(d);
        setState({ loading: false, error: null });
      })
      .catch((e) => setState({ loading: false, error: e.message }));
  }, [id]);

  if (state.loading) return <LoadingSpinner label="Loading transaction..." />;
  if (state.error) return <ErrorState message={state.error} />;

  return (
    <div className="space-y-5 max-w-4xl">
      <Link to="/transactions" className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-1">
        <ArrowLeft size={13} /> Back to Transaction Monitor
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold font-mono">Transaction {tx.transaction_id}</h1>
          <p className="text-xs text-text-secondary mt-1">Time step {tx.time_step} · split: {tx.split}</p>
        </div>
        <Link to={`/network?focus=${tx.transaction_id}`} className="btn-secondary flex items-center gap-2">
          <Network size={14} /> View in Network Graph
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Original Dataset Label"><LabelBadge label={tx.original_label} /></Field>
        <Field label="ML Predicted Label"><LabelBadge label={tx.predicted_label} /></Field>
        <Field label="Risk Level"><RiskBadge level={tx.risk_level} /></Field>
        <Field label="Investigation Status">
          <span className="capitalize text-sm">{tx.investigation_status}</span>
        </Field>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Fraud Probability">
          <span className="text-sm tabular-nums">
            {tx.illicit_probability != null ? `${(tx.illicit_probability * 100).toFixed(2)}%` : "—"}
          </span>
        </Field>
        <Field label="Risk Score (0-100)">
          <span className="text-sm tabular-nums">{tx.risk_score != null ? tx.risk_score.toFixed(1) : "—"}</span>
        </Field>
        <Field label="Model Used">
          <span className="text-sm">{tx.model_name || "—"}</span>
        </Field>
        <Field label="Connected Transactions">
          <span className="text-sm tabular-nums">{tx.connected_transactions?.length || 0}</span>
        </Field>
      </div>

      {tx.explanation && (
        <div className="card p-5">
          <h2 className="text-sm font-medium mb-3">Model Prediction Explanation</h2>
          <p className="text-xs text-text-secondary mb-4">
            Features most responsible for this transaction's risk score, ranked by global model
            importance and how far the value sits from a typical licit transaction. This is an
            estimate, not proof of criminal activity.
          </p>
          <div className="space-y-2">
            {tx.explanation.map((f) => (
              <div key={f.feature} className="flex items-center justify-between text-sm border-b border-[#1E293B]/60 pb-2">
                <span className="font-mono text-xs text-text-secondary">{f.feature}</span>
                <span>
                  value {f.value.toFixed(3)}{" "}
                  <span className="text-text-secondary">
                    ({f.direction} typical, z={f.robust_z.toFixed(2)})
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tx.connected_transactions?.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-medium mb-3">Connected Transaction IDs</h2>
          <div className="flex flex-wrap gap-2">
            {tx.connected_transactions.map((cid) => (
              <Link key={cid} to={`/transactions/${cid}`} className="font-mono text-xs px-2 py-1 rounded bg-[#162034] text-primary hover:underline">
                {cid}
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-text-secondary">{tx.disclaimer}</p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="card p-4">
      <p className="text-[11px] text-text-secondary mb-1">{label}</p>
      {children}
    </div>
  );
}
