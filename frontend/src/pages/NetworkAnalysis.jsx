import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReactFlow, { Background, Controls, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import { Search } from "lucide-react";
import { api } from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";

const LABEL_COLOR = { licit: "#22C55E", illicit: "#EF4444", unknown: "#64748B" };

function buildGraph(centerId, neighbors) {
  const nodes = [
    {
      id: String(centerId),
      position: { x: 0, y: 0 },
      data: { label: `${centerId}` },
      style: nodeStyle("unknown", true),
    },
  ];
  const edges = [];
  const radius = 220;
  neighbors.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(neighbors.length, 1);
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    const highRisk = n.risk_level === "High" || n.risk_level === "Critical";
    nodes.push({
      id: String(n.transaction_id),
      position: { x, y },
      data: { label: `${n.transaction_id}` },
      style: nodeStyle(n.original_label, false, highRisk),
    });
    edges.push({
      id: `${centerId}-${n.transaction_id}`,
      source: n.direction === "outgoing" ? String(centerId) : String(n.transaction_id),
      target: n.direction === "outgoing" ? String(n.transaction_id) : String(centerId),
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, color: "#3485F7", width: 14, height: 14 },
      style: { stroke: "#3485F7", strokeWidth: 1.5 },
    });
  });
  return { nodes, edges };
}

function nodeStyle(label, isCenter, highRisk) {
  return {
    background: "#111C30",
    color: "#F8FAFC",
    border: `2px solid ${highRisk ? "#F97316" : LABEL_COLOR[label] || "#1E293B"}`,
    borderRadius: 10,
    fontSize: 11,
    padding: 6,
    fontFamily: "monospace",
    boxShadow: isCenter ? "0 0 0 3px rgba(52,133,247,0.35)" : "none",
  };
}

export default function NetworkAnalysis() {
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get("focus") || "");
  const [state, setState] = useState({ loading: false, error: null });
  const [data, setData] = useState(null);

  const focus = params.get("focus");

  useEffect(() => {
    if (focus) load(focus);
  }, [focus]);

  async function load(id) {
    setState({ loading: true, error: null });
    try {
      const d = await api.getNeighbors(id);
      setData(d);
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: e.message });
      setData(null);
    }
  }

  function submit(e) {
    e.preventDefault();
    if (input.trim()) setParams({ focus: input.trim() });
  }

  const graph = useMemo(() => (data ? buildGraph(data.transaction_id, data.neighbors) : null), [data]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Wallet & Network Analysis</h1>
        <p className="text-xs text-text-secondary mt-1">
          Transaction IDs are anonymized dataset identifiers, not real Bitcoin wallet addresses.
        </p>
      </div>

      <form onSubmit={submit} className="card p-4 flex gap-3 items-center">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter a transaction ID to investigate its connections..."
          className="input-field flex-1"
        />
        <button className="btn-primary flex items-center gap-2">
          <Search size={14} /> Investigate
        </button>
      </form>

      {!focus ? (
        <EmptyState title="Search a transaction to view its network" description="Connections come from the dataset's edge list." />
      ) : state.loading ? (
        <LoadingSpinner label="Loading transaction network..." />
      ) : state.error ? (
        <ErrorState message={state.error} onRetry={() => load(focus)} />
      ) : data.neighbors.length === 0 ? (
        <EmptyState
          title={`No graph data for transaction ${focus}`}
          description="This transaction has no recorded connections in the dataset's edge list, or the edge list is unavailable."
        />
      ) : (
        <>
          <div className="card p-2 h-[520px]">
            <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView proOptions={{ hideAttribution: true }}>
              <Background color="#1E293B" gap={18} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          <div className="card p-4 flex flex-wrap gap-4 text-xs text-text-secondary">
            <Legend color="#22C55E" label="Legitimate" />
            <Legend color="#EF4444" label="Illicit" />
            <Legend color="#64748B" label="Unknown" />
            <Legend color="#F97316" label="High-risk prediction (outline)" />
          </div>
          <div className="card p-5">
            <h2 className="text-sm font-medium mb-3">
              Connections for Transaction {data.transaction_id} ({data.neighbors.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-secondary text-xs border-b border-[#1E293B]">
                    <th className="py-2">Transaction ID</th>
                    <th className="py-2">Direction</th>
                    <th className="py-2">Original Label</th>
                    <th className="py-2">Predicted</th>
                    <th className="py-2">Risk Level</th>
                  </tr>
                </thead>
                <tbody>
                  {data.neighbors.map((n, i) => (
                    <tr key={i} className="border-b border-[#1E293B]/60">
                      <td className="py-2 font-mono text-xs">{n.transaction_id}</td>
                      <td className="py-2 capitalize text-text-secondary">{n.direction}</td>
                      <td className="py-2 capitalize">{n.original_label}</td>
                      <td className="py-2 capitalize">{n.predicted_label || "—"}</td>
                      <td className="py-2">{n.risk_level || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: color }} />
      {label}
    </span>
  );
}
