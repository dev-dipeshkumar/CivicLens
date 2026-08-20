// Typed API client. Uses relative URLs → Vite dev proxy forwards to FastAPI.

export type Category = "pothole" | "garbage" | "streetlight" | "road_damage" | "uncertain";
export type Severity = "low" | "medium" | "high" | "critical";
export type Status = "new" | "assigned" | "in_progress" | "resolved";
export type Department = "roads" | "sanitation" | "lighting" | "general";

export interface Report {
  id: string;
  image_path: string;
  image_hash: string;
  category: Category;
  confidence: number;
  severity: Severity;
  severity_reason: string;
  description: string | null;
  lat: number;
  lng: number;
  status: Status;
  department: Department;
  confirmations: number;
  duplicate_of: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportCreateResult {
  report: Report;
  duplicate: boolean;
  duplicate_distance_m: number | null;
  confirmations: number;
  message: string;
}

export interface AnalyticsSummary {
  total: number;
  by_status: Record<string, number>;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  by_department: Record<string, number>;
  reports_today: number;
  critical_open: number;
  trend_14d: { date: string; count: number }[];
}

export interface HeatPoint { lat: number; lng: number; weight: number; }
export interface HeatmapResponse { points: HeatPoint[]; }

// ---------------------------------------------------------------------------
// Runtime config
// ---------------------------------------------------------------------------
// VITE_API_BASE_URL — absolute origin of the FastAPI backend
//                    (e.g. "https://civiclens-api.onrender.com").
//                    Leave empty in local dev — the Vite proxy handles it.
// VITE_API_KEY      — value to send in the X-API-Key header. Defaults to the
//                    demo key so the app "just works" in dev.
// ---------------------------------------------------------------------------
const API_BASE: string = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const API_KEY: string  = import.meta.env.VITE_API_KEY ?? "civiclens-demo-key";

/** Build a full URL for an API path, honoring VITE_API_BASE_URL when set. */
const url = (path: string) => `${API_BASE}${path}`;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body?.error || body?.detail || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// --- Public ---

export async function createReport(input: {
  image: File; lat: number; lng: number; description?: string;
}): Promise<ReportCreateResult> {
  const fd = new FormData();
  fd.append("image", input.image);
  fd.append("lat", String(input.lat));
  fd.append("lng", String(input.lng));
  if (input.description) fd.append("description", input.description);
  const res = await fetch("/api/reports", { method: "POST", body: fd });
  return json(res);
}

// --- Authority (needs X-API-Key) ---

export async function listReports(params: {
  status?: Status; category?: Category; severity?: Severity;
  limit?: number; offset?: number;
} = {}): Promise<Report[]> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && q.append(k, String(v)));
  const res = await fetch(`/api/reports?${q.toString()}`, {
    headers: { "X-API-Key": API_KEY },
  });
  return json(res);
}

export async function getReport(id: string): Promise<Report> {
  const res = await fetch(`/api/reports/${id}`, { headers: { "X-API-Key": API_KEY } });
  return json(res);
}

export async function updateStatus(id: string, status: Status): Promise<Report> {
  const res = await fetch(`/api/reports/${id}/status`, {
    method: "PATCH",
    headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return json(res);
}

export async function getSummary(): Promise<AnalyticsSummary> {
  const res = await fetch("/api/analytics/summary", { headers: { "X-API-Key": API_KEY } });
  return json(res);
}

export async function getHeatmap(): Promise<HeatmapResponse> {
  const res = await fetch("/api/analytics/heatmap", { headers: { "X-API-Key": API_KEY } });
  return json(res);
}

export async function getHealth(): Promise<{ status: string; ai_mode: string; version: string }> {
  const res = await fetch("/health");
  return json(res);
}
