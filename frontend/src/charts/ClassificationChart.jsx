import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = { licit: "#22C55E", illicit: "#EF4444", unknown: "#64748B" };

export default function ClassificationChart({ data }) {
  const chartData = data.map((d) => ({ name: d.label, value: d.count }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
          {chartData.map((d) => (
            <Cell key={d.name} fill={COLORS[d.name] || "#3485F7"} stroke="#111C30" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ background: "#111C30", border: "1px solid #1E293B", borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#94A3B8" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
