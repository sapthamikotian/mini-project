import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function ModelPerformanceChart({ data }) {
  const chartData = data.map((m) => ({
    name: m.model_name.replace(/_/g, " "),
    Accuracy: +(m.accuracy * 100).toFixed(1),
    Precision: +(m.illicit_precision * 100).toFixed(1),
    Recall: +(m.illicit_recall * 100).toFixed(1),
    F1: +(m.illicit_f1 * 100).toFixed(1),
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ left: -20, right: 10 }}>
        <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} unit="%" />
        <Tooltip contentStyle={{ background: "#111C30", border: "1px solid #1E293B", borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#94A3B8" }} />
        <Bar dataKey="Accuracy" fill="#3485F7" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Precision" fill="#20C9D8" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Recall" fill="#22C55E" radius={[4, 4, 0, 0]} />
        <Bar dataKey="F1" fill="#F59E0B" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
