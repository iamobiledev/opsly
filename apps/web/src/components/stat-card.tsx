export function StatCard({ label, value, tone = "slate" }: { label: string; value: string | number; tone?: "slate" | "red" | "amber" | "cyan" }) {
  const tones = {
    slate: "border-white/10 bg-white/5 text-white",
    red: "border-red-400/30 bg-red-500/10 text-red-100",
    amber: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    cyan: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100"
  };

  return (
    <div className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}
