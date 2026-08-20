import { AnimatePresence, motion } from "framer-motion";
import L from "leaflet";
import {
  Activity, AlertTriangle, BarChart3, Filter, Layers, LayoutDashboard,
  ListChecks, MapIcon, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import {
  Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { AnimatedCount } from "../components/AnimatedCount";
import { HeatLayer } from "../components/HeatLayer";
import { Logo } from "../components/Logo";
import { severityDivIcon } from "../components/MapPin";
import { SeverityBadge } from "../components/SeverityBadge";
import { Skeleton } from "../components/Skeleton";
import { StatusPill } from "../components/StatusPill";
import { useToast } from "../components/Toast";
import {
  getHeatmap, getSummary, listReports, updateStatus,
  type AnalyticsSummary, type HeatPoint, type Report, type Severity, type Status,
} from "../lib/api";
import {
  CATEGORY_EMOJI, CATEGORY_LABEL, SEVERITY_COLOR, STATUS_LABEL, timeAgo,
} from "../lib/tokens";

const DEMO_CENTER: [number, number] = [26.9124, 75.7873];

// leaflet default icon fix (unused for pins but needed for popups)
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/* -------------------------------------------------------------------------- */
/*  Layout                                                                    */
/* -------------------------------------------------------------------------- */

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-night text-slate-100 flex">
      <Sidebar />
      <div className="flex-1 relative">
        <div className="absolute inset-0 pointer-events-none bg-grid-dark bg-grid-40 opacity-70" />
        <div className="relative">
          <Topbar />
          <Routes>
            <Route index element={<Overview />} />
            <Route path="map" element={<MapView />} />
            <Route path="queue" element={<Queue />} />
            <Route path="analytics" element={<AnalyticsPage />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function Sidebar() {
  const link = (to: string, icon: React.ReactNode, label: string, end = false) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
          isActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
  return (
    <aside className="w-60 shrink-0 border-r border-white/[.06] p-4 flex flex-col gap-4 bg-panel/60 backdrop-blur">
      <div className="pt-1">
        <Logo variant="dark" />
      </div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 px-2 mt-4">Navigation</div>
      <nav className="space-y-1">
        {link("/dashboard", <LayoutDashboard size={16}/>, "Overview", true)}
        {link("/dashboard/map", <MapIcon size={16}/>, "Map")}
        {link("/dashboard/queue", <ListChecks size={16}/>, "Priority Queue")}
        {link("/dashboard/analytics", <BarChart3 size={16}/>, "Analytics")}
      </nav>
      <div className="mt-auto">
        <SystemStatus />
      </div>
    </aside>
  );
}

function SystemStatus() {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await fetch("/health"); if (!cancelled) setOk(true); }
      catch { if (!cancelled) setOk(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  return (
    <div className="glass-card px-3 py-2 flex items-center gap-2 text-xs">
      <span className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-400" : "bg-rose-500"} animate-pulseGlow`} />
      <span className="text-slate-300">System {ok ? "online" : "offline"}</span>
      <span className="ml-auto text-slate-500 mono">v1.0</span>
    </div>
  );
}

function Topbar() {
  return (
    <header className="px-6 py-4 flex items-center gap-3 border-b border-white/[.06]">
      <div>
        <div className="font-display text-xl font-bold">Authority Command Center</div>
        <div className="text-xs text-slate-400">Real-time civic issue triage · powered by CivicLens AI</div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="glass-card px-3 py-1.5 text-xs mono text-slate-300">
          AUTH · demo-key
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Data hook — shared summary + reports fetch                                */
/* -------------------------------------------------------------------------- */

function useDashboardData() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [heat, setHeat] = useState<HeatPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getSummary(), listReports({ limit: 200 }), getHeatmap()])
      .then(([s, r, h]) => {
        if (!alive) return;
        setSummary(s); setReports(r); setHeat(h.points);
        setError(null);
      })
      .catch((e) => alive && setError(e.message || "Failed to load"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [tick]);

  return { summary, reports, heat, loading, error, refresh: () => setTick((t) => t + 1) };
}

/* -------------------------------------------------------------------------- */
/*  Overview                                                                  */
/* -------------------------------------------------------------------------- */

function Overview() {
  const { summary, reports, heat, loading, refresh } = useDashboardData();
  const navigate = useNavigate();

  const cards = useMemo(() => {
    const openCount = summary
      ? (summary.by_status["new"] || 0) + (summary.by_status["assigned"] || 0) + (summary.by_status["in_progress"] || 0)
      : 0;
    const resolved = summary?.by_status["resolved"] || 0;
    const totalDone = openCount + resolved;
    const resolutionRate = totalDone ? Math.round((resolved / totalDone) * 100) : 0;
    return [
      { label: "Open Issues",     value: openCount,                 color: "#0EA5E9", icon: <Activity size={16}/> },
      { label: "Critical Count",  value: summary?.critical_open ?? 0, color: SEVERITY_COLOR.critical, icon: <AlertTriangle size={16}/> },
      { label: "Reports Today",   value: summary?.reports_today ?? 0, color: SEVERITY_COLOR.medium, icon: <LayoutDashboard size={16}/> },
      { label: "Resolution %",    value: resolutionRate,             color: SEVERITY_COLOR.low, icon: <ListChecks size={16}/>, suffix: "%" },
    ];
  }, [summary]);

  return (
    <div className="p-6 space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading || !summary
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass-card p-5"><Skeleton className="h-24"/></div>
            ))
          : cards.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-card p-5 relative overflow-hidden"
              >
                <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full blur-2xl opacity-30" style={{ background: c.color }} />
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${c.color}22`, color: c.color }}>
                    {c.icon}
                  </span>
                  {c.label}
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <div className="font-display text-4xl font-bold text-white">
                    <AnimatedCount value={c.value} />{c.suffix || ""}
                  </div>
                </div>
                {summary && (
                  <div className="mt-3 h-8 -mx-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={summary.trend_14d}>
                        <Line
                          type="monotone" dataKey="count" stroke={c.color}
                          strokeWidth={2} dot={false} isAnimationActive
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </motion.div>
            ))}
      </div>

      {/* Map + Live list */}
      <div className="grid xl:grid-cols-[1.4fr_1fr] gap-6">
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="font-display font-semibold">Live Map</div>
            <button
              onClick={() => navigate("/dashboard/map")}
              className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"
            >
              Expand <MapIcon size={12}/>
            </button>
          </div>
          {reports && (
            <div className="h-[420px] rounded-xl overflow-hidden dark-map">
              <MapView.SimpleMap reports={reports} heat={heat} />
            </div>
          )}
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="font-display font-semibold">Latest reports</div>
            <button onClick={refresh} className="text-xs text-slate-400 hover:text-white">Refresh</button>
          </div>
          <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
            {loading || !reports
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)
              : reports.slice(0, 12).map((r, i) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 border border-white/[.06] hover:border-white/20 transition-colors"
                  >
                    <div className="text-xl">{CATEGORY_EMOJI[r.category]}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {CATEGORY_LABEL[r.category]}
                        {r.confirmations > 0 && (
                          <span className="ml-2 text-[11px] text-brand-emerald mono">+{r.confirmations}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mono">
                        {r.lat.toFixed(4)}, {r.lng.toFixed(4)} · {timeAgo(r.created_at)}
                      </div>
                    </div>
                    <SeverityBadge level={r.severity} size="sm" />
                  </motion.div>
                ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Map view                                                                  */
/* -------------------------------------------------------------------------- */

function MapView() {
  const { reports, heat, loading, refresh } = useDashboardData();
  const [showHeat, setShowHeat] = useState(true);
  const [selected, setSelected] = useState<Report | null>(null);

  return (
    <div className="p-6">
      <div className="glass-card p-4">
        <div className="flex items-center gap-3 mb-3 px-1">
          <div className="font-display font-semibold">Live map</div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowHeat((v) => !v)}
              className={`chip border ${showHeat ? "bg-brand-sky/20 text-brand-sky border-brand-sky/40" : "border-white/10 text-slate-400"}`}
            >
              <Layers size={12}/> Heatmap
            </button>
          </div>
        </div>
        <div className="h-[70vh] rounded-xl overflow-hidden relative dark-map">
          {loading || !reports ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <MapView.SimpleMap
              reports={reports}
              heat={heat}
              showHeat={showHeat}
              onSelect={setSelected}
            />
          )}
          <AnimatePresence>
            {selected && (
              <ReportPanel report={selected} onClose={() => setSelected(null)} onChanged={refresh} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

MapView.SimpleMap = function SimpleMap({
  reports, heat, showHeat = false, onSelect,
}: {
  reports: Report[]; heat: HeatPoint[]; showHeat?: boolean;
  onSelect?: (r: Report) => void;
}) {
  return (
    <MapContainer center={DEMO_CENTER} zoom={14} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {showHeat && <HeatLayer points={heat} enabled />}
      {reports.map((r) => (
        <Marker
          key={r.id}
          position={[r.lat, r.lng]}
          icon={severityDivIcon(r.severity, r.status)}
          eventHandlers={onSelect ? { click: () => onSelect(r) } : undefined}
        >
          <Popup>
            <div className="text-xs">
              <div className="font-semibold">{CATEGORY_EMOJI[r.category]} {CATEGORY_LABEL[r.category]}</div>
              <div className="mono text-[10px]">{r.id.slice(0, 8)}</div>
              <div className="mt-1">Severity: <b>{r.severity}</b></div>
              <div>Status: <b>{STATUS_LABEL[r.status]}</b></div>
              {r.confirmations > 0 && <div>Confirmations: <b>{r.confirmations}</b></div>}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

/* -------------------------------------------------------------------------- */
/*  Report slide-over panel                                                   */
/* -------------------------------------------------------------------------- */

function ReportPanel({
  report, onClose, onChanged,
}: {
  report: Report; onClose: () => void; onChanged: () => void;
}) {
  const { push } = useToast();
  const [working, setWorking] = useState(false);

  const change = async (status: Status) => {
    setWorking(true);
    try {
      await updateStatus(report.id, status);
      push("success", `Status → ${STATUS_LABEL[status]}`);
      onChanged();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Update failed";
      push("error", msg);
    } finally {
      setWorking(false);
    }
  };

  return (
    <motion.div
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-panel border-l border-white/10 z-[1000] overflow-auto"
    >
      <div className="p-5">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Close report panel"
        >
          <X size={18}/>
        </button>

        <div className="text-xs text-slate-400 mono">#{report.id.slice(0, 8)}</div>
        <div className="mt-1 flex items-center gap-2">
          <div className="text-2xl">{CATEGORY_EMOJI[report.category]}</div>
          <div className="font-display text-xl font-bold">{CATEGORY_LABEL[report.category]}</div>
        </div>

        <div className="mt-3 rounded-xl overflow-hidden border border-white/10 bg-black">
          <img
            src={`${(import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "")}/${report.image_path}`}
            alt="Report photo"
            className="w-full h-56 object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <SeverityBadge level={report.severity} />
          <StatusPill status={report.status} />
          {report.confirmations > 0 && (
            <span className="chip bg-brand-emerald/20 text-brand-emerald border border-brand-emerald/40">
              🔁 {report.confirmations} confirmations
            </span>
          )}
        </div>

        <div className="mt-3 text-sm text-slate-300 bg-white/[.03] border border-white/[.06] rounded-xl px-3 py-2">
          {report.severity_reason}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <Field k="Confidence" v={`${Math.round(report.confidence * 100)}%`} />
          <Field k="Department" v={report.department} />
          <Field k="Latitude"   v={report.lat.toFixed(5)} mono />
          <Field k="Longitude"  v={report.lng.toFixed(5)} mono />
          <Field k="Created"    v={timeAgo(report.created_at)} />
          <Field k="Updated"    v={timeAgo(report.updated_at)} />
        </dl>

        <div className="mt-5">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">Update status</div>
          <div className="flex flex-wrap gap-2">
            {(["assigned", "in_progress", "resolved"] as Status[]).map((s) => (
              <button
                key={s}
                onClick={() => change(s)}
                disabled={working || report.status === s}
                className="chip border border-white/10 hover:border-brand-sky hover:text-brand-sky disabled:opacity-40 disabled:pointer-events-none bg-white/5"
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Field({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-white/[.06] bg-white/[.02] px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
      <div className={`text-slate-200 ${mono ? "mono" : ""}`}>{v}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Priority Queue                                                            */
/* -------------------------------------------------------------------------- */

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

function Queue() {
  const { reports, loading, refresh } = useDashboardData();
  const { push } = useToast();

  const [sort, setSort] = useState<"severity" | "recency" | "confirmations">("severity");
  const [filterSev, setFilterSev] = useState<Severity | "all">("all");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");

  const sorted = useMemo(() => {
    if (!reports) return [];
    let out = [...reports];
    if (filterSev !== "all") out = out.filter((r) => r.severity === filterSev);
    if (filterStatus !== "all") out = out.filter((r) => r.status === filterStatus);
    if (sort === "severity") {
      out.sort((a, b) => {
        const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (s !== 0) return s;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else if (sort === "recency") {
      out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      out.sort((a, b) => b.confirmations - a.confirmations);
    }
    return out;
  }, [reports, sort, filterSev, filterStatus]);

  const change = async (id: string, s: Status) => {
    try {
      await updateStatus(id, s);
      push("success", `Marked ${STATUS_LABEL[s]}`);
      refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Update failed";
      push("error", msg);
    }
  };

  return (
    <div className="p-6">
      <div className="glass-card p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3 px-1">
          <div className="font-display font-semibold">Priority Queue</div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <Filter size={14} className="text-slate-400" />
            <SelectPill
              value={sort}
              onChange={(v) => setSort(v as typeof sort)}
              options={[
                { value: "severity", label: "Sort: Severity" },
                { value: "recency", label: "Sort: Recency" },
                { value: "confirmations", label: "Sort: Confirmations" },
              ]}
            />
            <SelectPill
              value={filterSev}
              onChange={(v) => setFilterSev(v as Severity | "all")}
              options={[
                { value: "all", label: "All severities" },
                { value: "critical", label: "Critical" },
                { value: "high", label: "High" },
                { value: "medium", label: "Medium" },
                { value: "low", label: "Low" },
              ]}
            />
            <SelectPill
              value={filterStatus}
              onChange={(v) => setFilterStatus(v as Status | "all")}
              options={[
                { value: "all", label: "All statuses" },
                { value: "new", label: "New" },
                { value: "assigned", label: "Assigned" },
                { value: "in_progress", label: "In progress" },
                { value: "resolved", label: "Resolved" },
              ]}
            />
          </div>
        </div>

        {loading || !reports ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12"/>)}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-auto -mx-1">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Severity</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Age</th>
                  <th className="px-3 py-2">Confirm</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <motion.tr
                    key={r.id}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.015, 0.4) }}
                    className="border-t border-white/[.05] hover:bg-white/[.03]"
                  >
                    <td className="px-3 py-2 mono text-slate-400 text-xs">{r.id.slice(0, 6)}</td>
                    <td className="px-3 py-2">
                      <span className="mr-1">{CATEGORY_EMOJI[r.category]}</span>
                      {CATEGORY_LABEL[r.category]}
                    </td>
                    <td className="px-3 py-2"><SeverityBadge level={r.severity} size="sm"/></td>
                    <td className="px-3 py-2 text-slate-300 capitalize">{r.department}</td>
                    <td className="px-3 py-2 mono text-xs text-slate-400">
                      {r.lat.toFixed(3)}, {r.lng.toFixed(3)}
                    </td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{timeAgo(r.created_at)}</td>
                    <td className="px-3 py-2 mono text-brand-emerald">{r.confirmations || "—"}</td>
                    <td className="px-3 py-2"><StatusPill status={r.status}/></td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        {(["assigned", "in_progress", "resolved"] as Status[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => change(r.id, s)}
                            disabled={r.status === s}
                            className="text-[11px] rounded-md px-2 py-1 border border-white/10 hover:border-brand-sky hover:text-brand-sky text-slate-300 disabled:opacity-30 disabled:pointer-events-none"
                          >
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SelectPill({
  value, onChange, options,
}: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full bg-white/5 border border-white/10 text-slate-200 text-xs px-3 py-1.5 outline-none focus:border-brand-sky"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-panel">{o.label}</option>
      ))}
    </select>
  );
}

function EmptyState() {
  return (
    <div className="py-16 text-center text-slate-400">
      <div className="text-5xl mb-2">🌤️</div>
      <div className="font-display font-semibold text-lg text-white">All clear</div>
      <div className="text-sm">No issues match your filters. Try widening them.</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Analytics                                                                 */
/* -------------------------------------------------------------------------- */

function AnalyticsPage() {
  const { summary, loading } = useDashboardData();

  const catData = useMemo(
    () => summary
      ? Object.entries(summary.by_category).map(([k, v]) => ({
          name: CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL] || k, value: v, key: k,
        }))
      : [],
    [summary]
  );

  const catColors: Record<string, string> = {
    pothole: "#4338CA",
    garbage: "#10B981",
    streetlight: "#F59E0B",
    road_damage: "#F97316",
    uncertain: "#64748B",
  };

  const sevData = useMemo(
    () => summary
      ? (["low", "medium", "high", "critical"] as Severity[]).map((s) => ({
          name: s, value: summary.by_severity[s] || 0, color: SEVERITY_COLOR[s],
        }))
      : [],
    [summary]
  );

  return (
    <div className="p-6 grid xl:grid-cols-2 gap-6">
      <div className="glass-card p-5">
        <div className="font-display font-semibold mb-4">Issues by category</div>
        {loading || !summary ? (
          <Skeleton className="h-64" />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={catData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                  {catData.map((d) => (
                    <Cell key={d.key} fill={catColors[d.key] || "#64748B"} stroke="none" />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 12, color: "#fff" }} />
                <Legend wrapperStyle={{ color: "#cbd5e1" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="glass-card p-5">
        <div className="font-display font-semibold mb-4">14-day trend</div>
        {loading || !summary ? (
          <Skeleton className="h-64" />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={summary.trend_14d}>
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke="#64748b" fontSize={11}/>
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false}/>
                <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 12, color: "#fff" }} />
                <Line type="monotone" dataKey="count" stroke="#0EA5E9" strokeWidth={2.5} dot={{ r: 3, fill: "#0EA5E9" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="glass-card p-5 xl:col-span-2">
        <div className="font-display font-semibold mb-4">Severity distribution</div>
        {loading || !summary ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {sevData.map((s) => (
              <div key={s.name} className="rounded-xl border border-white/[.06] p-4 bg-white/[.02]">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wider text-slate-400">{s.name}</div>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                </div>
                <div className="mt-2 font-display text-3xl font-bold" style={{ color: s.color }}>
                  <AnimatedCount value={s.value} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
