import { notFound } from "next/navigation";
import { resolveOnCall } from "@opsly/core";
import { prisma } from "@opsly/db";
import { requireUser } from "../../../../lib/auth";

export default async function ScheduleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: {
      team: true,
      overrides: { include: { user: true }, orderBy: { startsAt: "asc" } },
      layers: {
        include: {
          participants: { include: { user: true }, orderBy: { position: "asc" } }
        },
        orderBy: { startsAt: "asc" }
      }
    }
  });

  if (!schedule) {
    notFound();
  }

  const onCallByHour = Array.from({ length: 24 }, (_, hour) => {
    const at = new Date(Date.now() + hour * 60 * 60 * 1000);
    const namesById = new Map(schedule.layers.flatMap((layer) => layer.participants.map((participant) => [participant.userId, participant.user.name])));
    const onCall = resolveOnCall(
      {
        id: schedule.id,
        timezone: schedule.timezone,
        overrides: schedule.overrides,
        layers: schedule.layers.map((layer) => ({
          id: layer.id,
          startsAt: layer.startsAt,
          endsAt: layer.endsAt,
          rotationLengthMinutes: layer.rotationLengthMinutes,
          participants: layer.participants
        }))
      },
      at
    );
    return {
      at,
      names: onCall.map((userId) => namesById.get(userId) ?? userId)
    };
  });

  return (
    <div>
      <h1 className="text-4xl font-bold">{schedule.name}</h1>
      <p className="mt-2 text-slate-400">
        {schedule.team?.name ?? "No team"} · {schedule.timezone} · {schedule.description ?? "No description"}
      </p>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <Panel title="Next 24 hours">
          <div className="grid gap-3 md:grid-cols-2">
            {onCallByHour.map((slot) => (
              <div key={slot.at.toISOString()} className="rounded-xl bg-slate-900/80 p-3">
                <p className="text-xs text-slate-500">{slot.at.toLocaleString()}</p>
                <p className="mt-1 font-medium">{slot.names.join(", ") || "No responder"}</p>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Rotation layers">
            <div className="space-y-4">
              {schedule.layers.map((layer) => (
                <div key={layer.id} className="rounded-xl bg-slate-900/80 p-4">
                  <p className="font-semibold">{layer.name}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Starts {layer.startsAt.toLocaleString()} · every {layer.rotationLengthMinutes} minutes
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {layer.participants.map((participant) => (
                      <span key={participant.id} className="rounded-full bg-white/10 px-3 py-1 text-sm">
                        {participant.position + 1}. {participant.user.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Overrides">
            <div className="space-y-3">
              {schedule.overrides.map((override) => (
                <div key={override.id} className="rounded-xl bg-slate-900/80 p-3">
                  <p className="font-medium">{override.user.name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {override.startsAt.toLocaleString()} → {override.endsAt.toLocaleString()}
                  </p>
                  {override.reason ? <p className="mt-2 text-sm text-slate-300">{override.reason}</p> : null}
                </div>
              ))}
              {schedule.overrides.length === 0 ? <p className="text-sm text-slate-400">No overrides configured.</p> : null}
            </div>
          </Panel>
        </div>
      </section>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}
