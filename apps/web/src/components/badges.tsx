export function StatusBadge({ status }: { status: string }) {
  const className =
    status === "triggered"
      ? "bg-red-500/15 text-red-200 ring-red-400/30"
      : status === "acknowledged"
        ? "bg-amber-500/15 text-amber-200 ring-amber-400/30"
        : "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${className}`}>{status}</span>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const className =
    severity === "critical"
      ? "bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/30"
      : severity === "error"
        ? "bg-red-500/15 text-red-200 ring-red-400/30"
        : severity === "warning"
          ? "bg-amber-500/15 text-amber-200 ring-amber-400/30"
          : "bg-sky-500/15 text-sky-200 ring-sky-400/30";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${className}`}>{severity}</span>;
}
