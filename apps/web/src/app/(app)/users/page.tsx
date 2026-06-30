import { prisma } from "@opsly/db";
import { createUserAction } from "../../../lib/actions/admin";
import { requireUser } from "../../../lib/auth";

export default async function UsersPage() {
  const user = await requireUser();
  const organizationId = user.memberships[0]?.organizationId;
  const memberships = await prisma.membership.findMany({
    where: { organizationId },
    include: { user: true },
    orderBy: { createdAt: "asc" }
  });

  return (
    <div>
      <h1 className="text-4xl font-bold">Users</h1>
      <p className="mt-2 text-slate-400">Create responders, admins, and viewers for incident response.</p>

      <form action={createUserAction} className="mt-8 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <input name="name" required placeholder="Name" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
        <input name="email" required type="email" placeholder="Email" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
        <input name="password" required type="password" placeholder="Temporary password" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
        <select name="role" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2">
          <option value="responder">Responder</option>
          <option value="admin">Admin</option>
          <option value="viewer">Viewer</option>
          <option value="owner">Owner</option>
        </select>
        <button className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950">Create</button>
      </form>

      <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Slack</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {memberships.map((membership) => (
              <tr key={membership.id}>
                <td className="px-4 py-4 font-medium">{membership.user.name}</td>
                <td className="px-4 py-4 text-slate-400">{membership.user.email}</td>
                <td className="px-4 py-4">{membership.role}</td>
                <td className="px-4 py-4 text-slate-400">{membership.user.slackUserId ?? "not linked"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
