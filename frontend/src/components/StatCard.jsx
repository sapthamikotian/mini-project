export default function StatCard({ label, value, icon: Icon, tone = "default", sublabel }) {
  const toneClasses = {
    default: "text-text-primary bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    critical: "bg-critical/10 text-critical",
    cyan: "bg-cyan/10 text-cyan",
  };
  return (
    <div className="card p-5 flex items-start justify-between">
      <div>
        <p className="text-xs text-text-secondary mb-1">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {sublabel && <p className="text-[11px] text-text-secondary mt-1">{sublabel}</p>}
      </div>
      {Icon && (
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${toneClasses[tone]}`}>
          <Icon size={18} />
        </div>
      )}
    </div>
  );
}
