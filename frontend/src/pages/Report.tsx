import { AnimatePresence, motion } from "framer-motion";
import L from "leaflet";
import {
  ArrowLeft, ArrowRight, Camera, Check, Loader2, MapPin, Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import { Link, useNavigate } from "react-router-dom";
import { Confetti } from "../components/Confetti";
import { Logo } from "../components/Logo";
import { SeverityBadge } from "../components/SeverityBadge";
import { useToast } from "../components/Toast";
import { createReport, type ReportCreateResult } from "../lib/api";
import { CATEGORY_EMOJI, CATEGORY_LABEL } from "../lib/tokens";

const DEMO_CENTER: [number, number] = [26.9124, 75.7873]; // Jaipur

// ---- Leaflet default marker fix (icons served via a public CDN in dev) ----
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/* -------------------------------------------------------------------------- */
/*  Sub components                                                            */
/* -------------------------------------------------------------------------- */

function ClickToPin({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Progress({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["Upload", "Location", "AI Analysis"];
  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        {labels.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const active = step === n;
          const done = step > n;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  done
                    ? "bg-brand-emerald border-brand-emerald text-white"
                    : active
                    ? "bg-white border-brand-indigo text-brand-indigo"
                    : "bg-white border-slate-200 text-slate-400"
                }`}
              >
                {done ? <Check size={16} /> : n}
              </div>
              <div className={`text-sm font-medium ${active ? "text-ink" : "text-slate-500"}`}>{label}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-brand-gradient"
          initial={{ width: "0%" }}
          animate={{ width: `${((step - 1) / 2) * 100}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

type Stage = 1 | 2 | 3;

const SCAN_STEPS = [
  "🔍 Detecting object…",
  "📊 Scoring severity…",
  "🔁 Checking for duplicates…",
  "🗺️ Locating on map…",
];

export default function Report() {
  const navigate = useNavigate();
  const { push } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>(1);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [description, setDescription] = useState("");

  const [scanIdx, setScanIdx] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ReportCreateResult | null>(null);

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const acceptFile = useCallback((f: File | null | undefined) => {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      push("error", "File too large (max 8 MB)");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      push("error", "Please upload a JPEG, PNG or WebP image");
      return;
    }
    setFile(f);
  }, [push]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    acceptFile(e.dataTransfer.files?.[0]);
  };

  /* ---------------- Submit (stage 3) ---------------- */

  const submit = useCallback(async () => {
    if (!file || !coords) return;
    setAnalyzing(true);
    setScanIdx(0);
    // Cycle scanning captions while the request is in flight.
    const t = setInterval(() => setScanIdx((i) => (i + 1) % SCAN_STEPS.length), 900);
    try {
      const res = await createReport({
        image: file, lat: coords[0], lng: coords[1], description: description || undefined,
      });
      // ensure at least ~2.2s of "scanning" for narrative rhythm
      await new Promise((r) => setTimeout(r, 1200));
      setResult(res);
      push("success", res.duplicate ? "Merged with existing report" : "Report submitted");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      push("error", msg);
    } finally {
      clearInterval(t);
      setAnalyzing(false);
    }
  }, [file, coords, description, push]);

  useEffect(() => {
    if (stage === 3 && !result && !analyzing) submit();
  }, [stage, result, analyzing, submit]);

  const reset = () => {
    setFile(null); setPreview(""); setCoords(null); setDescription("");
    setResult(null); setStage(1);
  };

  const canNextFrom1 = !!file;
  const canNextFrom2 = !!coords;

  return (
    <div className="min-h-screen bg-canvas">
      {/* Top bar */}
      <header className="sticky top-0 z-30 backdrop-blur bg-canvas/80 border-b border-slate-100">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink">
            <ArrowLeft size={16}/> Back
          </Link>
          <Logo />
          <span className="w-16" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <Progress step={stage} />

        <div className="mt-10">
          <AnimatePresence mode="wait">

            {/* ============ STEP 1 — UPLOAD ============ */}
            {stage === 1 && (
              <motion.section
                key="s1"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="card"
              >
                <h2 className="font-display text-2xl font-bold">Upload a photo</h2>
                <p className="text-slate-600 mt-1">
                  A single clear photo is enough — the AI will detect the issue and its severity.
                </p>

                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop}
                  className="mt-6 block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 hover:border-brand-sky hover:bg-slate-50/60 transition-all"
                >
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => acceptFile(e.target.files?.[0])}
                    aria-label="Choose an image to upload"
                  />
                  {preview ? (
                    <div className="p-4">
                      <img
                        src={preview}
                        alt="Report preview"
                        className="w-full max-h-[380px] object-contain rounded-xl border border-slate-100"
                      />
                    </div>
                  ) : (
                    <div className="py-16 flex flex-col items-center gap-3 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-brand-gradient text-white flex items-center justify-center shadow-glow">
                        <Upload size={22} />
                      </div>
                      <div className="font-semibold">Drop your photo here</div>
                      <div className="text-sm text-slate-500">or click to browse • camera capture supported on mobile</div>
                      <div className="text-xs text-slate-400 mt-1">JPEG / PNG / WebP · up to 8 MB</div>
                    </div>
                  )}
                </label>

                <div className="mt-4">
                  <label className="text-sm font-medium text-slate-700">
                    Description (optional)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-sky outline-none"
                    rows={2}
                    placeholder="e.g. Deep pothole near the school gate…"
                    maxLength={500}
                  />
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    className="btn-primary disabled:opacity-40 disabled:pointer-events-none"
                    disabled={!canNextFrom1}
                    onClick={() => setStage(2)}
                  >
                    Next: Pin location <ArrowRight size={16}/>
                  </button>
                </div>
              </motion.section>
            )}

            {/* ============ STEP 2 — LOCATION ============ */}
            {stage === 2 && (
              <motion.section
                key="s2"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="card"
              >
                <h2 className="font-display text-2xl font-bold">Where is it?</h2>
                <p className="text-slate-600 mt-1">
                  Tap the map to drop a pin. We start centered on your city.
                </p>

                <div className="mt-6 h-[420px] rounded-2xl overflow-hidden border border-slate-200">
                  <MapContainer center={DEMO_CENTER} zoom={14} style={{ height: "100%", width: "100%" }}>
                    <TileLayer
                      attribution='&copy; OpenStreetMap'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <ClickToPin onPick={(lat, lng) => setCoords([lat, lng])} />
                    {coords && <Marker position={coords} />}
                  </MapContainer>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-1.5 mono text-xs">
                    <MapPin size={14} />
                    {coords ? `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}` : "Click the map to pin"}
                  </div>
                  <button
                    className="text-sm text-brand-indigo hover:underline"
                    onClick={() => {
                      if (!navigator.geolocation) {
                        push("error", "Geolocation not available");
                        return;
                      }
                      navigator.geolocation.getCurrentPosition(
                        (pos) => setCoords([pos.coords.latitude, pos.coords.longitude]),
                        () => push("error", "Couldn't get your location"),
                        { enableHighAccuracy: true, timeout: 8000 }
                      );
                    }}
                  >
                    Use my location
                  </button>
                </div>

                <div className="mt-6 flex justify-between">
                  <button className="btn-ghost" onClick={() => setStage(1)}>
                    <ArrowLeft size={16}/> Back
                  </button>
                  <button
                    className="btn-primary disabled:opacity-40 disabled:pointer-events-none"
                    disabled={!canNextFrom2}
                    onClick={() => setStage(3)}
                  >
                    Analyze with AI <ArrowRight size={16}/>
                  </button>
                </div>
              </motion.section>
            )}

            {/* ============ STEP 3 — AI ANALYSIS ============ */}
            {stage === 3 && (
              <motion.section
                key="s3"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="grid lg:grid-cols-[1.1fr_1fr] gap-6"
              >
                {/* Scanning image panel */}
                <div className="card">
                  <div className="relative rounded-xl overflow-hidden border border-slate-100 bg-slate-100 aspect-video">
                    {preview && (
                      <img src={preview} alt="Analyzing" className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    {analyzing && (
                      <>
                        <div className="absolute inset-0 pointer-events-none">
                          <div className="h-16 w-full bg-gradient-to-b from-transparent via-brand-sky/60 to-transparent animate-scan" />
                        </div>
                        <div className="absolute inset-0 ring-1 ring-inset ring-brand-sky/40" />
                      </>
                    )}
                  </div>

                  <div className="mt-4 min-h-[28px]">
                    {analyzing ? (
                      <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                        <Loader2 className="animate-spin" size={16}/> {SCAN_STEPS[scanIdx]}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">Analysis complete.</div>
                    )}
                  </div>
                </div>

                {/* Result panel */}
                <div className="relative">
                  <AnimatePresence>
                    {result ? (
                      <ResultCard result={result} onAnother={reset} onViewDashboard={() => navigate("/dashboard")} />
                    ) : (
                      <SkeletonResult />
                    )}
                  </AnimatePresence>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Result & skeleton                                                         */
/* -------------------------------------------------------------------------- */

function SkeletonResult() {
  return (
    <motion.div key="skel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="card">
      <div className="skeleton h-6 w-32 mb-3" />
      <div className="skeleton h-4 w-2/3 mb-2" />
      <div className="skeleton h-24 w-full mb-4" />
      <div className="skeleton h-10 w-40" />
    </motion.div>
  );
}

function ResultCard({
  result, onAnother, onViewDashboard,
}: {
  result: ReportCreateResult;
  onAnother: () => void;
  onViewDashboard: () => void;
}) {
  const r = result.report;
  const emoji = CATEGORY_EMOJI[r.category];
  const catLabel = CATEGORY_LABEL[r.category];
  const isDup = result.duplicate;

  const summaryStat = useMemo(
    () => [
      { k: "Category",   v: `${emoji} ${catLabel}` },
      { k: "Confidence", v: `${Math.round(r.confidence * 100)}%` },
      { k: "Department", v: r.department },
      { k: "Report ID",  v: r.id.slice(0, 8), mono: true },
    ],
    [emoji, catLabel, r]
  );

  return (
    <motion.div
      key="result"
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      className="card relative overflow-hidden"
    >
      <Confetti />

      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-full bg-brand-emerald text-white flex items-center justify-center">
          <Check size={20} />
        </div>
        <div>
          <div className="font-display font-bold text-lg">
            {isDup ? "Report corroborated" : "Report submitted"}
          </div>
          <div className="text-xs text-slate-500">{result.message}</div>
        </div>
      </div>

      {isDup && (
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2">
          🔁 {result.confirmations} other{result.confirmations === 1 ? " has" : "s have"} reported this
          issue nearby ({Math.round(result.duplicate_distance_m || 0)} m). Your report{" "}
          <b>strengthens it</b> — duplicates make hotspots visible.
        </div>
      )}

      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <div className="text-3xl">{emoji}</div>
        <div>
          <div className="font-display font-bold text-xl">{catLabel}</div>
          <div className="text-xs text-slate-500 mono">Confidence {(r.confidence * 100).toFixed(0)}%</div>
        </div>
        <div className="ml-auto"><SeverityBadge level={r.severity} size="lg" /></div>
      </div>

      <div className="mt-3 text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
        <b>Why this severity: </b>{r.severity_reason}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {summaryStat.map((s) => (
          <div key={s.k} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{s.k}</div>
            <div className={`text-sm font-semibold ${s.mono ? "mono" : ""}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex gap-3">
        <button className="btn-cta" onClick={onAnother}>
          <Camera size={16}/> Report another
        </button>
        <button className="btn-ghost" onClick={onViewDashboard}>
          View on dashboard <ArrowRight size={16}/>
        </button>
      </div>
    </motion.div>
  );
}
