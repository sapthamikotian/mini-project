import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function TimeSeriesChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ left: -20, right: 10 }}>
        <defs>
          <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3485F7" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#3485F7" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="time_step" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ background: "#111C30", border: "1px solid #1E293B", borderRadius: 8, fontSize: 12 }} />
        <Area type="monotone" dataKey="total" stroke="#3485F7" fill="url(#totalGrad)" strokeWidth={2} name="Total transactions" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
