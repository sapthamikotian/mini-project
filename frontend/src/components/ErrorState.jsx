import { AlertTriangle } from "lucide-react";

export default function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <AlertTriangle size={28} className="text-critical mb-3" />
      <p className="text-sm font-medium mb-1">Something went wrong</p>
      <p className="text-xs text-text-secondary max-w-sm mb-4">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary">
          Retry
        </button>
      )}
    </div>
  );
}
