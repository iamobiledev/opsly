import { prisma } from "@opsly/db";
import { requireUser } from "../../../lib/auth";

export default async function TeamsPage() {
  const user = await requireUser();
  const organizationId = user.memberships[0]?.organizationId;
  const teams = await prisma.team.findMany({
    where: { organizationId },
    include: {
      memberships: { include: { user: true } },
      services: true,
      schedules: true
    },
    orderBy: { name: "asc" }
  });

  return (
    <div>
      <h1 className="text-4xl font-bold">Teams</h1>
      <p className="mt-2 text-slate-400">Owners, responders, services, and rotations.</p>
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {teams.map((team) => (
          <div key={team.id} className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-2xl font-semibold">{team.name}</h2>
            <p className="mt-2 text-sm text-slate-400">{team.description}</p>
            <div className="mt-5">
              <p className="text-xs uppercase tracking-wide text-slate-500">Members</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {team.memberships.map((membership) => (
                  <span key={membership.id} className="rounded-full bg-slate-900 px-3 py-1 text-sm">
                    {membership.user.name} · {membership.role}
                  </span>
                ))}
              </div>
            </div>
            <p className="mt-5 text-sm text-slate-400">{team.services.length} services · {team.schedules.length} schedules</p>
          </div>
        ))}
      </div>
    </div>
  );
}
