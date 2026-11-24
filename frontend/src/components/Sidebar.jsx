import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, ListChecks, ShieldAlert, Network, Bell,
  BarChart3, FileText, Settings as SettingsIcon, Bitcoin,
} from "lucide-react";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "Transaction Monitor", icon: ListChecks },
  { to: "/fraud-detection", label: "AI Fraud Detection", icon: ShieldAlert },
  { to: "/network", label: "Wallet & Network Analysis", icon: Network },
  { to: "/alerts", label: "Suspicious Alerts", icon: Bell },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function Sidebar() {
  return (
    <aside className="w-64 shrink-0 bg-sidebar border-r border-[#1E293B] flex flex-col h-screen sticky top-0">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-[#1E293B]">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <Bitcoin size={18} className="text-primary" />
        </div>
        <span className="font-semibold tracking-wide text-sm">BITCOIN SENTINEL</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-text-secondary hover:bg-[#162034] hover:text-text-primary"
              }`
            }
          >
            <Icon size={17} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-[#1E293B] text-[11px] text-text-secondary leading-snug">
        Historical dataset analysis only. Not a live blockchain monitor.
      </div>
    </aside>
  );
}
