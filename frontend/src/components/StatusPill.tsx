import type { Status } from "../lib/api";
import { STATUS_COLOR, STATUS_LABEL } from "../lib/tokens";

/** Small status pill used in the priority queue and detail panel. */
export function StatusPill({ status }: { status: Status }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className="chip"
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}55` }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
