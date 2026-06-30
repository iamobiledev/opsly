import { notFound } from "next/navigation";
import { prisma } from "@opsly/db";
import { SeverityBadge, StatusBadge } from "../../../../components/badges";
import { createMaintenanceWindowAction, createSuppressionRuleAction } from "../../../../lib/actions/admin";
import { requireUser } from "../../../../lib/auth";

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const service = await prisma.service.findUnique({
    where: { id },
    include: {
      team: true,
      escalationPolicy: { include: { rules: { orderBy: { level: "asc" } } } },
      integrations: { include: { routingRules: { orderBy: { order: "asc" } } } },
      slackChannelBindings: true,
      suppressionRules: true,
      maintenanceWindows: { orderBy: { startsAt: "desc" } },
      incidents: { orderBy: { createdAt: "desc" }, take: 10 }
    }
  });

  if (!service) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-4xl font-bold">{service.name}</h1>
      <p className="mt-2 max-w-3xl text-slate-400">{service.description}</p>
      <section className="mt-8 grid gap-6 xl:grid-cols-2">
        <Panel title="Integrations">
          <div className="space-y-4">
            {service.integrations.map((integration) => (
              <div key={integration.id} className="rounded-xl bg-slate-900/80 p-4">
                <p className="font-semibold">{integration.name}</p>
                <p className="mt-1 text-sm text-slate-400">{integration.type} · routing key `{integration.routingKey}`</p>
                <p className="mt-3 text-xs text-slate-500">{integration.routingRules.length} routing rules</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Escalation policy">
          {service.escalationPolicy ? (
            <div>
              <p className="font-semibold">{service.escalationPolicy.name}</p>
              <div className="mt-4 space-y-3">
                {service.escalationPolicy.rules.map((rule) => (
                  <div key={rule.id} className="rounded-xl bg-slate-900/80 p-3 text-sm">
                    Level {rule.level}: notify {rule.targetType} after {rule.delayMinutes} minutes
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No policy configured.</p>
          )}
        </Panel>
        <Panel title="Slack bindings">
          {service.slackChannelBindings.map((binding) => (
            <div key={binding.id} className="rounded-xl bg-slate-900/80 p-3 text-sm">
              #{binding.channelName} ({binding.channelId}) · {binding.mode}
            </div>
          ))}
        </Panel>
        <Panel title="Suppression and maintenance">
          <form action={createSuppressionRuleAction} className="mb-5 grid gap-3">
            <input type="hidden" name="serviceId" value={service.id} />
            <input name="name" required placeholder="Suppression rule name" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
            <input name="routeStartsWith" placeholder="Route starts with (e.g. /_debugbar/)" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
            <input name="environment" placeholder="Environment (optional)" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
            <button className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950">Add suppression</button>
          </form>
          <form action={createMaintenanceWindowAction} className="mb-5 grid gap-3">
            <input type="hidden" name="serviceId" value={service.id} />
            <input name="reason" required placeholder="Maintenance reason" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
            <input name="startsAt" required type="datetime-local" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
            <input name="endsAt" required type="datetime-local" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
            <button className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950">Add maintenance</button>
          </form>
          <div className="space-y-3">
            {service.suppressionRules.map((rule) => (
              <div key={rule.id} className="rounded-xl bg-slate-900/80 p-3 text-sm">{rule.name}</div>
            ))}
            {service.maintenanceWindows.map((window) => (
              <div key={window.id} className="rounded-xl bg-slate-900/80 p-3 text-sm">{window.reason}</div>
            ))}
            {service.suppressionRules.length + service.maintenanceWindows.length === 0 ? (
              <p className="text-sm text-slate-400">No active suppression or maintenance records.</p>
            ) : null}
          </div>
        </Panel>
      </section>
      <Panel title="Recent incidents">
        <div className="space-y-3">
          {service.incidents.map((incident) => (
            <div key={incident.id} className="flex items-center justify-between rounded-xl bg-slate-900/80 p-3">
              <div>
                <p className="font-medium">#{incident.number} {incident.title}</p>
                <p className="text-xs text-slate-400">{incident.createdAt.toLocaleString()}</p>
              </div>
              <div className="flex gap-2"><StatusBadge status={incident.status} /><SeverityBadge severity={incident.severity} /></div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}
