import { useEffect, useRef, useState } from "react";
import { UploadCloud, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { api } from "../services/api";
import ConfirmDialog from "../components/ConfirmDialog";

const REQUIRED_FILES = ["elliptic_txs_features.csv", "elliptic_txs_classes.csv", "elliptic_txs_edgelist.csv"];

export default function Settings() {
  const [status, setStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [health, setHealth] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    refresh();
    api.health().then(() => setHealth("ok")).catch(() => setHealth("down"));
  }, []);

  function refresh() {
    api.getDatasetStatus().then(setStatus).catch(() => setStatus(null));
  }

  async function handleFiles(files) {
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        await api.uploadDatasetFile(file);
      }
      refresh();
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function doReset() {
    setConfirmOpen(false);
    await api.resetDataset();
    refresh();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-xs text-text-secondary mt-1">Dataset, model, and application configuration.</p>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-medium mb-4">Dataset Information</h2>
        <div className="space-y-2 mb-4">
          {REQUIRED_FILES.map((f) => {
            const present = status?.required_files?.[f];
            return (
              <div key={f} className="flex items-center justify-between text-sm border-b border-[#1E293B]/60 py-2 last:border-0">
                <span className="font-mono text-xs">{f}</span>
                {present ? (
                  <span className="flex items-center gap-1 text-success text-xs">
                    <CheckCircle2 size={14} /> Present
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-text-secondary text-xs">
                    <XCircle size={14} /> Missing
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <label className="btn-secondary inline-flex items-center gap-2 cursor-pointer">
          <UploadCloud size={14} />
          {uploading ? "Uploading..." : "Upload CSV file"}
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            disabled={uploading}
            onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
          />
        </label>
        {uploadError && <p className="text-xs text-critical mt-2">{uploadError}</p>}
        <p className="text-[11px] text-text-secondary mt-2">
          Upload each of the three Elliptic CSVs one at a time, matching the filenames above exactly.
          After all three are present, run training from the AI Fraud Detection page.
        </p>

        {status?.summary && (
          <div className="mt-4 pt-4 border-t border-[#1E293B] grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Total" value={status.summary.total_transactions} />
            <Stat label="Illicit" value={status.summary.illicit} />
            <Stat label="Licit" value={status.summary.licit} />
            <Stat label="Unknown" value={status.summary.unknown} />
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-medium mb-4">Model Information</h2>
        <p className="text-xs text-text-secondary">
          Models are trained from the AI Fraud Detection page: Logistic Regression, Decision Tree, and
          Random Forest, compared on a held-out, time-ordered test split. Risk scores are derived from
          the illicit-class probability and are estimates, not proof of criminal activity.
        </p>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-medium mb-4">Application Information</h2>
        <div className="space-y-1 text-sm">
          <Row label="Application" value="Bitcoin Sentinel v1.0.0" />
          <Row label="Dataset mode" value="Historical analysis (not live blockchain monitoring)" />
          <Row
            label="API status"
            value={health === "ok" ? "Connected" : health === "down" ? "Unreachable" : "Checking..."}
            tone={health === "ok" ? "success" : health === "down" ? "critical" : undefined}
          />
          <Row label="Database" value="SQLite (local file)" />
        </div>
      </div>

      <div className="card p-5 border-critical/30">
        <h2 className="text-sm font-medium mb-2 text-critical">Danger Zone</h2>
        <p className="text-xs text-text-secondary mb-4">
          Deletes uploaded raw CSVs, processed outputs, and trained models from disk. This cannot be
          undone and will require re-uploading the dataset and retraining.
        </p>
        <button onClick={() => setConfirmOpen(true)} className="flex items-center gap-2 text-sm text-critical hover:underline">
          <Trash2 size={14} /> Reset Dataset
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Reset dataset?"
        description="This permanently deletes the uploaded dataset, processed files, and trained models."
        danger
        onConfirm={doReset}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-[11px] text-text-secondary">{label}</p>
      <p className="font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

function Row({ label, value, tone }) {
  const toneClass = tone === "success" ? "text-success" : tone === "critical" ? "text-critical" : "";
  return (
    <div className="flex justify-between py-1.5 border-b border-[#1E293B]/60 last:border-0">
      <span className="text-text-secondary">{label}</span>
      <span className={toneClass}>{value}</span>
    </div>
  );
}
