import { prisma } from "@opsly/db";
import { createEscalationPolicyAction } from "../../../lib/actions/admin";
import { requireUser } from "../../../lib/auth";

export default async function EscalationPoliciesPage() {
  const user = await requireUser();
  const organizationId = user.memberships[0]?.organizationId;
  const policies = await prisma.escalationPolicy.findMany({
    where: { organizationId },
    include: { team: true, rules: { orderBy: { level: "asc" } }, services: true },
    orderBy: { name: "asc" }
  });
  const teams = await prisma.team.findMany({ where: { organizationId }, orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="text-4xl font-bold">Escalation policies</h1>
      <p className="mt-2 text-slate-400">Define who is notified and when incidents are not acknowledged.</p>
      <form action={createEscalationPolicyAction} className="mt-8 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 lg:grid-cols-3">
        <input name="name" required placeholder="Policy name" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
        <select name="teamId" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2">
          <option value="">No team</option>
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <input name="description" placeholder="Description" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
        <select name="targetType" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2">
          <option value="team">Team</option>
          <option value="schedule">Schedule</option>
          <option value="user">User</option>
        </select>
        <input name="targetId" placeholder="Target id (optional: team id)" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
        <input name="delayMinutes" type="number" min="0" defaultValue="0" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
        <button className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950 lg:col-span-3">Save policy</button>
      </form>
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
