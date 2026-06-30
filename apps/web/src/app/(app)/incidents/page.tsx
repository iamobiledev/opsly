import Link from "next/link";
import { prisma } from "@opsly/db";
import { SeverityBadge, StatusBadge } from "../../../components/badges";
import { requireUser } from "../../../lib/auth";

export default async function IncidentsPage() {
  const user = await requireUser();
  const organizationId = user.memberships[0]?.organizationId;
  const incidents = await prisma.incident.findMany({
    where: { organizationId },
    include: { service: true, alerts: { take: 1, orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return (
    <div>
      <h1 className="text-4xl font-bold">Incidents</h1>
      <p className="mt-2 text-slate-400">Triggered, acknowledged, and resolved incidents across ROWS services.</p>
      <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Incident</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {incidents.map((incident) => (
              <tr key={incident.id} className="hover:bg-white/5">
                <td className="px-4 py-4">
                  <Link href={`/incidents/${incident.id}`} className="font-semibold text-white hover:text-cyan-300">
                    #{incident.number} {incident.title}
                  </Link>
                  <p className="mt-1 max-w-xl truncate text-xs text-slate-400">{incident.description}</p>
                </td>
                <td className="px-4 py-4">{incident.service.name}</td>
                <td className="px-4 py-4"><StatusBadge status={incident.status} /></td>
                <td className="px-4 py-4"><SeverityBadge severity={incident.severity} /></td>
                <td className="px-4 py-4 text-slate-400">{incident.createdAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
