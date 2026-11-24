export default function ConfusionMatrix({ matrix }) {
  if (!matrix) return null;
  const { tn, fp, fn, tp } = matrix;
  const cells = [
    { label: "True Licit", value: tn, tone: "bg-success/15 text-success" },
    { label: "False Illicit", value: fp, tone: "bg-warning/15 text-warning" },
    { label: "False Licit", value: fn, tone: "bg-warning/15 text-warning" },
    { label: "True Illicit", value: tp, tone: "bg-success/15 text-success" },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 max-w-xs">
        {cells.map((c) => (
          <div key={c.label} className={`rounded-lg p-3 text-center ${c.tone}`}>
            <p className="text-lg font-semibold tabular-nums">{c.value.toLocaleString()}</p>
            <p className="text-[10px] mt-0.5 opacity-80">{c.label}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-text-secondary mt-2">Rows: actual label · Columns: model prediction</p>
    </div>
  );
}
