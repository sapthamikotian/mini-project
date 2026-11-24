import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function FraudTrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ left: -20, right: 10 }}>
        <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="time_step" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ background: "#111C30", border: "1px solid #1E293B", borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#94A3B8" }} />
        <Line type="monotone" dataKey="illicit_known" stroke="#EF4444" strokeWidth={2} dot={false} name="Known illicit" />
        <Line type="monotone" dataKey="illicit_predicted" stroke="#F59E0B" strokeWidth={2} dot={false} strokeDasharray="4 2" name="Predicted illicit" />
      </LineChart>
    </ResponsiveContainer>
  );
}
