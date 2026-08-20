import type { Severity } from "../lib/api";
import { SEVERITY_COLOR, SEVERITY_LABEL } from "../lib/tokens";

interface Props { level: Severity; size?: "sm" | "md" | "lg"; }

/** Colored severity pill with a small dot indicator. */
export function SeverityBadge({ level, size = "md" }: Props) {
  const color = SEVERITY_COLOR[level];
  const pad = size === "sm" ? "px-2 py-0.5 text-[10px]" : size === "lg" ? "px-3.5 py-1.5 text-sm" : "px-3 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${pad}`}
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}55` }}
      aria-label={`Severity ${SEVERITY_LABEL[level]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {SEVERITY_LABEL[level]}
    </span>
  );
}
