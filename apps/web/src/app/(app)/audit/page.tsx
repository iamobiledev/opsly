import { prisma } from "@opsly/db";
import { requireUser } from "../../../lib/auth";

export default async function AuditPage() {
  const user = await requireUser();
  const organizationId = user.memberships[0]?.organizationId;
  const logs = await prisma.auditLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return (
    <div>
      <h1 className="text-4xl font-bold">Audit log</h1>
      <p className="mt-2 text-slate-400">Immutable trail of setup, incident, and administrative actions.</p>
      <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-4 font-medium">{log.action}</td>
                <td className="px-4 py-4 text-slate-400">{log.actorType}</td>
                <td className="px-4 py-4 text-slate-400">{log.targetType}:{log.targetId}</td>
                <td className="px-4 py-4 text-slate-400">{log.createdAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
