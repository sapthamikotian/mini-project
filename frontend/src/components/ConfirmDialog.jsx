export default function ConfirmDialog({ open, title, description, onConfirm, onCancel, danger }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="card p-6 max-w-sm w-full">
        <p className="font-semibold mb-2">{title}</p>
        <p className="text-sm text-text-secondary mb-5">{description}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
              danger ? "bg-critical hover:bg-critical/80" : "bg-primary hover:bg-primary/80"
            }`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
