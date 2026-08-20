import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";
interface ToastItem { id: number; kind: ToastKind; msg: string; }

interface ToastCtx { push: (kind: ToastKind, msg: string) => void; }
const Ctx = createContext<ToastCtx>({ push: () => {} });

export const useToast = () => useContext(Ctx);

/** Global toast provider — mount once at app root. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, msg: string) => {
    const id = Date.now() + Math.random();
    setItems((it) => [...it, { id, kind, msg }]);
    setTimeout(() => setItems((it) => it.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              className={`pointer-events-auto flex items-center gap-2 rounded-2xl px-4 py-3 shadow-soft text-sm font-medium ${
                t.kind === "success"
                  ? "bg-emerald-500 text-white"
                  : t.kind === "error"
                  ? "bg-rose-500 text-white"
                  : "bg-slate-900 text-white"
              }`}
              role="status"
            >
              {t.kind === "success" && <CheckCircle2 size={18} />}
              {t.kind === "error"   && <XCircle size={18} />}
              {t.kind === "info"    && <Info size={18} />}
              <span>{t.msg}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
