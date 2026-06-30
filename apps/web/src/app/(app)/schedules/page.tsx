import Link from "next/link";
import { prisma } from "@opsly/db";
import { resolveOnCall } from "@opsly/core";
import { requireUser } from "../../../lib/auth";

export default async function SchedulesPage() {
  const user = await requireUser();
  const organizationId = user.memberships[0]?.organizationId;
  const schedules = await prisma.schedule.findMany({
    where: { organizationId },
    include: {
      team: true,
      layers: { include: { participants: { include: { user: true } } } },
      overrides: true
    }
  });

  return (
    <div>
      <h1 className="text-4xl font-bold">Schedules</h1>
      <p className="mt-2 text-slate-400">Rotation layers and overrides determine who receives escalations.</p>
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {schedules.map((schedule) => {
          const usersById = new Map(schedule.layers.flatMap((layer) => layer.participants.map((participant) => [participant.userId, participant.user.name])));
          const onCall = resolveOnCall({
            id: schedule.id,
            timezone: schedule.timezone,
            overrides: schedule.overrides,
            layers: schedule.layers.map((layer) => ({
              id: layer.id,
              startsAt: layer.startsAt,
              endsAt: layer.endsAt,
              rotationLengthMinutes: layer.rotationLengthMinutes,
              participants: layer.participants.map((participant) => ({
                userId: participant.userId,
                position: participant.position
              }))
            }))
          });

          return (
            <Link key={schedule.id} href={`/schedules/${schedule.id}`} className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10">
              <h2 className="text-2xl font-semibold">{schedule.name}</h2>
              <p className="mt-2 text-sm text-slate-400">{schedule.team?.name ?? "No team"} · {schedule.timezone}</p>
              <div className="mt-5 rounded-xl bg-slate-900/80 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">On-call now</p>
                <p className="mt-2 text-lg font-semibold">{onCall.map((id) => usersById.get(id) ?? id).join(", ") || "No responder"}</p>
              </div>
              <p className="mt-4 text-sm text-slate-400">{schedule.layers.length} layers · {schedule.overrides.length} overrides</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
