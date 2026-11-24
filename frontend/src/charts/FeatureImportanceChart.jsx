import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function FeatureImportanceChart({ data }) {
  const top = [...data].sort((a, b) => b.importance - a.importance).slice(0, 12).reverse();
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={top} layout="vertical" margin={{ left: 20, right: 20 }}>
        <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis dataKey="feature" type="category" stroke="#94A3B8" fontSize={11} width={90} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ background: "#111C30", border: "1px solid #1E293B", borderRadius: 8, fontSize: 12 }} />
        <Bar dataKey="importance" fill="#20C9D8" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
