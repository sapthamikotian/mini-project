// Thin fetch wrapper for the Bitcoin Sentinel FastAPI backend. Every function
// returns real backend data or throws -- nothing here fabricates a result.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new ApiError("Cannot reach the Bitcoin Sentinel API. Is the backend running?", 0);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, res.status);
  }
  const contentType = res.headers.get("content-type") || "";
  return contentType.includes("application/json") ? res.json() : res.blob();
}

function qs(params = {}) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export const api = {
  // Dashboard
  getDashboardStats: () => request("/api/dashboard/stats"),

  // Transactions
  listTransactions: (params) => request(`/api/transactions${qs(params)}`),
  getTransaction: (id) => request(`/api/transactions/${id}`),
  getNeighbors: (id) => request(`/api/transactions/${id}/neighbors`),
  exportTransactionsUrl: (params) => `${BASE_URL}/api/transactions/export${qs(params)}`,

  // Alerts
  listAlerts: (params) => request(`/api/alerts${qs(params)}`),
  updateAlert: (id, status) =>
    request(`/api/alerts/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  regenerateAlerts: () => request("/api/alerts/generate", { method: "POST" }),

  // Analytics
  getClassification: () => request("/api/analytics/classification"),
  getTimeSeries: () => request("/api/analytics/time-series"),
  getRiskDistribution: () => request("/api/analytics/risk-distribution"),
  getModelPerformance: (split = "test") => request(`/api/analytics/model-performance?split=${split}`),
  getFeatureImportance: (model = "random_forest") =>
    request(`/api/analytics/feature-importance?model_name=${model}`),

  // Model
  trainModel: (body) => request("/api/model/train", { method: "POST", body: JSON.stringify(body) }),
  getTrainStatus: () => request("/api/model/train/status"),
  getModelMetrics: () => request("/api/model/metrics"),
  predict: (features) =>
    request("/api/model/predict", { method: "POST", body: JSON.stringify({ features }) }),

  // Dataset
  getDatasetStatus: () => request("/api/dataset/status"),
  uploadDatasetFile: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE_URL}/api/dataset/upload`, { method: "POST", body: form });
    if (!res.ok) throw new ApiError((await res.json()).detail, res.status);
    return res.json();
  },
  resetDataset: () => request("/api/dataset/reset?confirm=true", { method: "DELETE" }),

  // Reports
  reportTransactionsUrl: () => `${BASE_URL}/api/reports/transactions`,
  reportAlertsUrl: () => `${BASE_URL}/api/reports/alerts`,
  getReportSummary: () => request("/api/reports/summary"),

  health: () => request("/api/health"),
};

export { ApiError };
