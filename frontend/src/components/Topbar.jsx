import { useEffect, useState } from "react";
import { Search, Bell, CircleUserRound, Database, DatabaseZap } from "lucide-react";
import { api } from "../services/api";

export default function Topbar({ onSearch }) {
  const [status, setStatus] = useState(null); // dataset status
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .getDatasetStatus()
      .then((d) => !cancelled && setStatus(d))
      .catch(() => !cancelled && setStatus({ loaded: false }));
    return () => {
      cancelled = true;
    };
  }, []);

  function submit(e) {
    e.preventDefault();
    onSearch?.(query.trim());
  }

  const loaded = status?.loaded;

  return (
    <header className="h-16 shrink-0 border-b border-[#1E293B] bg-bg/80 backdrop-blur sticky top-0 z-10 flex items-center justify-between px-6 gap-4">
      <form onSubmit={submit} className="flex items-center gap-2 max-w-md w-full">
        <div className="relative w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transaction ID..."
            className="input-field pl-9 w-full"
          />
        </div>
      </form>

      <div className="flex items-center gap-4">
        <div
          className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border ${
            loaded
              ? "border-success/30 bg-success/10 text-success"
              : "border-warning/30 bg-warning/10 text-warning"
          }`}
          title={loaded ? "Dataset loaded and monitored" : "No dataset loaded yet"}
        >
          {loaded ? <DatabaseZap size={13} /> : <Database size={13} />}
          <span>{loaded ? "Dataset Monitoring: Active" : "Dataset Not Loaded"}</span>
        </div>
        <span className="text-xs text-text-secondary hidden md:inline">
          {loaded ? "Elliptic Bitcoin Transaction Dataset" : "—"}
        </span>
        <button className="relative text-text-secondary hover:text-text-primary transition-colors">
          <Bell size={18} />
        </button>
        <CircleUserRound size={26} className="text-text-secondary" />
      </div>
    </header>
  );
}
