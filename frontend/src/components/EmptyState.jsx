import { Inbox } from "lucide-react";

export default function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-12 h-12 rounded-full bg-[#162034] flex items-center justify-center mb-4">
        <Icon size={22} className="text-text-secondary" />
      </div>
      <p className="text-sm font-medium text-text-primary mb-1">{title}</p>
      {description && <p className="text-xs text-text-secondary max-w-sm mb-4">{description}</p>}
      {action}
    </div>
  );
}
