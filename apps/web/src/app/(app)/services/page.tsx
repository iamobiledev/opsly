import Link from "next/link";
import { prisma } from "@opsly/db";
import { requireUser } from "../../../lib/auth";

export default async function ServicesPage() {
  const user = await requireUser();
  const organizationId = user.memberships[0]?.organizationId;
  const services = await prisma.service.findMany({
    where: { organizationId },
    include: {
      team: true,
      escalationPolicy: true,
      integrations: true,
      _count: { select: { incidents: true } }
    },
    orderBy: { name: "asc" }
  });

  return (
    <div>
      <h1 className="text-4xl font-bold">Services</h1>
      <p className="mt-2 text-slate-400">Own alert routing, escalation policies, and Slack destinations per service.</p>
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {services.map((service) => (
          <Link key={service.id} href={`/services/${service.id}`} className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">{service.name}</h2>
                <p className="mt-2 text-sm text-slate-400">{service.description}</p>
              </div>
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-200">{service.status}</span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
              <Meta label="Team" value={service.team?.name ?? "Unassigned"} />
              <Meta label="Policy" value={service.escalationPolicy?.name ?? "None"} />
              <Meta label="Incidents" value={String(service._count.incidents)} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-900/80 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  );
}
