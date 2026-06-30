import Link from "next/link";
import { prisma } from "@opsly/db";
import { StatCard } from "../../../components/stat-card";
import { SeverityBadge, StatusBadge } from "../../../components/badges";
import { requireUser } from "../../../lib/auth";

export default async function DashboardPage() {
  const user = await requireUser();
  const organizationId = user.memberships[0]?.organizationId;

  const [triggered, acknowledged, resolvedToday, incidents, inboundEvents, services] = await Promise.all([
    prisma.incident.count({ where: { organizationId, status: "triggered" } }),
    prisma.incident.count({ where: { organizationId, status: "acknowledged" } }),
    prisma.incident.count({
      where: {
        organizationId,
        status: "resolved",
        resolvedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    }),
    prisma.incident.findMany({
      where: { organizationId, status: { in: ["triggered", "acknowledged"] } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      include: { service: true },
      take: 8
    }),
    prisma.inboundEvent.findMany({
      where: { organizationId },
      orderBy: { receivedAt: "desc" },
      take: 6
    }),
    prisma.service.findMany({
      where: { organizationId },
      include: { _count: { select: { incidents: true } } },
      orderBy: { name: "asc" }
    })
  ]);

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Incident command</p>
          <h1 className="mt-2 text-4xl font-bold">Opsly dashboard</h1>
        </div>
        <Link href="/integrations" className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
          Configure integrations
        </Link>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <StatCard label="Triggered" value={triggered} tone="red" />
        <StatCard label="Acknowledged" value={acknowledged} tone="amber" />
        <StatCard label="Resolved in 24h" value={resolvedToday} tone="cyan" />
        <StatCard label="Services" value={services.length} />
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-2xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-xl font-semibold">Active incidents</h2>
          </div>
          <div className="divide-y divide-white/10">
            {incidents.map((incident) => (
              <Link key={incident.id} href={`/incidents/${incident.id}`} className="block p-5 hover:bg-white/5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm text-slate-400">#{incident.number}</span>
                  <StatusBadge status={incident.status} />
                  <SeverityBadge severity={incident.severity} />
                  <span className="text-sm text-slate-400">{incident.service.name}</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold">{incident.title}</h3>
              </Link>
            ))}
            {incidents.length === 0 ? <p className="p-5 text-sm text-slate-400">No active incidents.</p> : null}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-semibold">Recent inbound events</h2>
            <div className="mt-4 space-y-3">
              {inboundEvents.map((event) => (
                <div key={event.id} className="rounded-xl bg-slate-900/80 p-3">
                  <p className="text-sm font-medium">{event.provider}</p>
                  <p className="mt-1 text-xs text-slate-400">{event.status} · {event.receivedAt.toISOString()}</p>
                </div>
              ))}
              {inboundEvents.length === 0 ? <p className="text-sm text-slate-400">No inbound events yet.</p> : null}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-semibold">Services</h2>
            <div className="mt-4 space-y-3">
              {services.map((service) => (
                <Link key={service.id} href={`/services/${service.id}`} className="block rounded-xl bg-slate-900/80 p-3 hover:bg-slate-900">
                  <p className="font-medium">{service.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{service._count.incidents} lifetime incidents</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
