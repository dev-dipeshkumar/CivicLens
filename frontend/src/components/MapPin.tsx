import L from "leaflet";
import type { Severity, Status } from "../lib/api";
import { SEVERITY_COLOR } from "../lib/tokens";

/**
 * Build a leaflet DivIcon that renders a glowing pin whose color matches
 * the report's severity. Resolved reports render gray with a checkmark.
 */
export function severityDivIcon(severity: Severity, status: Status): L.DivIcon {
  const isResolved = status === "resolved";
  const color = isResolved ? "#64748b" : SEVERITY_COLOR[severity];
  const checkSvg = isResolved
    ? `<svg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round' style='position:absolute; top:5.5px; left:5.5px;'><polyline points='20 6 9 17 4 12'/></svg>`
    : "";
  const html = `
    <div class="pin ${isResolved ? "resolved" : ""}" aria-label="report">
      <div class="halo" style="background:${color}"></div>
      <div class="dot" style="background:${color}; box-shadow: 0 0 12px ${color}"></div>
      ${checkSvg}
    </div>`;
  return L.divIcon({
    className: "civiclens-pin",
    html,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}
