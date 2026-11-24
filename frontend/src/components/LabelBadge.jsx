const COLORS = {
  illicit: "bg-critical/10 text-critical border-critical/30",
  licit: "bg-success/10 text-success border-success/30",
  unknown: "bg-[#64748B]/10 text-text-secondary border-[#64748B]/30",
};

export default function LabelBadge({ label }) {
  if (!label) return <span className="text-text-secondary text-xs">—</span>;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${COLORS[label] || ""}`}>
      {label}
    </span>
  );
}
