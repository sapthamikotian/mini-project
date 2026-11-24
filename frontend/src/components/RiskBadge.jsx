const COLORS = {
  Low: "bg-success/10 text-success border-success/30",
  Medium: "bg-warning/10 text-warning border-warning/30",
  High: "bg-[#F97316]/10 text-[#F97316] border-[#F97316]/30",
  Critical: "bg-critical/10 text-critical border-critical/30",
};

export default function RiskBadge({ level }) {
  if (!level) return <span className="text-text-secondary text-xs">—</span>;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${COLORS[level] || ""}`}>
      {level}
    </span>
  );
}
