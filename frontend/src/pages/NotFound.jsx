import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-3xl font-semibold mb-2">404</p>
      <p className="text-sm text-text-secondary mb-5">This page doesn't exist.</p>
      <Link to="/" className="btn-primary">
        Back to Overview
      </Link>
    </div>
  );
}
