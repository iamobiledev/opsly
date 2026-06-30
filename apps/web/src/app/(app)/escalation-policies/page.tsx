import { prisma } from "@opsly/db";
import { requireUser } from "../../../lib/auth";

export default async function EscalationPoliciesPage() {
  const user = await requireUser();
  const organizationId = user.memberships[0]?.organizationId;
  const policies = await prisma.escalationPolicy.findMany({
    where: { organizationId },
    include: { team: true, rules: { orderBy: { level: "asc" } }, services: true },
    orderBy: { name: "asc" }
  });

  return (
    <div>
      <h1 className="text-4xl font-bold">Escalation policies</h1>
      <p className="mt-2 text-slate-400">Define who is notified and when incidents are not acknowledged.</p>
      <div className="mt-8 space-y-5">
        {policies.map((policy) => (
          <div key={policy.id} className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <h2 className="text-2xl font-semibold">{policy.name}</h2>
                <p className="mt-2 text-sm text-slate-400">{policy.description}</p>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">repeat {policy.repeatCount}x</span>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {policy.rules.map((rule) => (
                <div key={rule.id} className="rounded-xl bg-slate-900/80 p-4">
                  <p className="font-medium">Level {rule.level}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    After {rule.delayMinutes} min → {rule.targetType} `{rule.targetId}`
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-slate-400">Attached services: {policy.services.map((service) => service.name).join(", ") || "none"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
