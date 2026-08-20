import { motion } from "framer-motion";
import {
  Camera, Cpu, Wrench, ShieldCheck, MapPin, Sparkles, ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { SeverityBadge } from "../components/SeverityBadge";

/**
 * Landing page.
 *
 * Design intent: within 3 seconds the visitor sees WHAT (tagline),
 * HOW (3-step cards), and WHERE TO GO (two clear CTAs).
 */
export default function Landing() {
  return (
    <div className="min-h-screen bg-canvas">
      {/* ---------------- Top nav ---------------- */}
      <header className="sticky top-0 z-40 backdrop-blur bg-canvas/70 border-b border-slate-100">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Logo />
          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#why" className="hover:text-ink">Why CivicLens</a>
            <Link to="/dashboard" className="hover:text-ink">Authority</Link>
          </nav>
          <Link to="/report" className="btn-primary text-sm py-2 px-4">
            <Camera size={16} /> Report an Issue
          </Link>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="relative grain overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-[0.9]"
          style={{
            background:
              "radial-gradient(1000px 500px at 15% 10%, rgba(67,56,202,.18), transparent 60%), radial-gradient(800px 500px at 90% 20%, rgba(14,165,233,.18), transparent 60%), radial-gradient(700px 400px at 60% 90%, rgba(16,185,129,.15), transparent 60%)",
          }}
        />
        <div className="max-w-6xl mx-auto px-6 pt-16 pb-24 grid lg:grid-cols-[1.15fr_1fr] gap-10 items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 backdrop-blur px-3 py-1 text-xs font-semibold text-slate-700"
            >
              <Sparkles size={14} className="text-brand-indigo" />
              AI-powered civic reporting
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mt-5 font-display text-5xl sm:text-6xl font-bold leading-[1.05] tracking-tight"
            >
              Report less.
              <br />
              <span className="bg-brand-gradient bg-clip-text text-transparent">
                Understand more.
              </span>
              <br />
              Resolve faster.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mt-5 max-w-xl text-lg text-slate-600"
            >
              Snap a photo of a pothole, garbage pile or broken streetlight — our AI
              detects it, scores its severity, merges duplicates into confirmations, and
              routes it to the right municipal department automatically.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="mt-8 flex flex-wrap gap-3"
            >
              <Link to="/report" className="btn-cta">
                <Camera size={18} /> Report an Issue
              </Link>
              <Link to="/dashboard" className="btn-ghost">
                Authority Login → Dashboard <ArrowRight size={16} />
              </Link>
            </motion.div>

            <div className="mt-8 flex items-center gap-5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14}/> EXIF stripped on upload</span>
              <span className="inline-flex items-center gap-1.5"><MapPin size={14}/> Works from any phone</span>
            </div>
          </div>

          {/* Hero visual — floating severity badges + phone mock */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative h-[440px]"
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-[280px] h-[420px] rounded-[36px] bg-white shadow-soft border border-slate-100 overflow-hidden">
                <div className="h-32 bg-brand-gradient relative">
                  <div className="absolute bottom-3 left-4 text-white/90 text-xs font-semibold">CivicLens • Report</div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="rounded-xl bg-slate-100 h-24 relative overflow-hidden">
                    <div className="absolute inset-x-0 h-6 bg-gradient-to-b from-brand-sky/40 to-transparent animate-scan" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🕳️</span>
                    <span className="font-semibold text-sm">Pothole</span>
                    <span className="ml-auto text-xs text-slate-500 mono">92%</span>
                  </div>
                  <SeverityBadge level="high" />
                  <div className="text-xs text-slate-500">
                    Large pothole covering ~18% of frame. Auto-routed to Roads.
                  </div>
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3 py-2">
                    🔁 3 others reported this — your report strengthens it.
                  </div>
                </div>
              </div>
            </div>

            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-4 left-2"
            >
              <div className="card !p-3 flex items-center gap-2">
                <SeverityBadge level="critical" size="sm" />
                <span className="text-xs text-slate-500 mono">#a91f</span>
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, 12, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
              className="absolute top-16 right-0"
            >
              <div className="card !p-3 flex items-center gap-2">
                <SeverityBadge level="medium" size="sm" />
                <span className="text-xs text-slate-500">🗑️ Garbage</span>
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
              className="absolute bottom-6 left-4"
            >
              <div className="card !p-3 flex items-center gap-2">
                <SeverityBadge level="low" size="sm" />
                <span className="text-xs text-slate-500">💡 Streetlight</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="how" className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="font-display text-3xl sm:text-4xl font-bold">How it works</h2>
          <p className="mt-3 text-slate-600">
            One photo becomes an intelligent, deduplicated, priority-scored municipal task.
          </p>
        </div>

        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {[
            {
              icon: <Camera size={22} />, title: "1. Report",
              text: "Snap a photo, drop a pin. Anonymous by default — EXIF stripped on upload.",
            },
            {
              icon: <Cpu size={22} />, title: "2. AI Detect",
              text: "Our model classifies the issue, scores severity, and merges duplicates into confirmations.",
            },
            {
              icon: <Wrench size={22} />, title: "3. Resolve",
              text: "Authority dashboard shows a live map + priority queue. Status changes flow back in real time.",
            },
          ].map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="card hover:-translate-y-1 hover:shadow-glow transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-brand-gradient text-white flex items-center justify-center shadow-glow">
                {s.icon}
              </div>
              <div className="mt-4 font-display font-semibold text-lg">{s.title}</div>
              <div className="mt-1.5 text-slate-600 text-sm leading-relaxed">{s.text}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------------- Why ---------------- */}
      <section id="why" className="bg-white border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-6">
          {[
            { k: "Duplicates → Confirmations", v: "Multiple reports of the same issue don't clutter the queue — they strengthen it." },
            { k: "Explainable severity", v: "Every score comes with a human-readable reason. No black-box AI." },
            { k: "Never-fail demo", v: "3-tier detection fallback: Roboflow → local YOLO → deterministic mock." },
          ].map((f) => (
            <div key={f.k} className="border-l-4 border-brand-sky pl-4">
              <div className="font-display font-bold">{f.k}</div>
              <div className="text-sm text-slate-600 mt-1">{f.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="max-w-6xl mx-auto px-6 py-16 text-center">
        <h3 className="font-display text-3xl font-bold">Ready to see your city clearer?</h3>
        <div className="mt-6 flex justify-center gap-3 flex-wrap">
          <Link to="/report" className="btn-cta"><Camera size={18}/> Report an Issue</Link>
          <Link to="/dashboard" className="btn-primary">Open the Dashboard <ArrowRight size={16}/></Link>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-500">
        CivicLens AI — Team CivicLens AI
      </footer>
    </div>
  );
}
