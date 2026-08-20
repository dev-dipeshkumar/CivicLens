// Shared design tokens for severity / category theming.

import type { Category, Severity, Status } from "./api";

export const SEVERITY_COLOR: Record<Severity, string> = {
  low: "#22C55E",
  medium: "#F59E0B",
  high: "#F97316",
  critical: "#EF4444",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "Low", medium: "Medium", high: "High", critical: "Critical",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  pothole: "Pothole",
  garbage: "Garbage",
  streetlight: "Streetlight",
  road_damage: "Road damage",
  uncertain: "Uncertain",
};

export const CATEGORY_EMOJI: Record<Category, string> = {
  pothole: "🕳️",
  garbage: "🗑️",
  streetlight: "💡",
  road_damage: "🚧",
  uncertain: "❓",
};

export const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In progress",
  resolved: "Resolved",
};

export const STATUS_COLOR: Record<Status, string> = {
  new: "#0EA5E9",
  assigned: "#8B5CF6",
  in_progress: "#F59E0B",
  resolved: "#64748B",
};

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const s = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
