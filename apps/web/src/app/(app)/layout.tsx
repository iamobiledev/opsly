import Link from "next/link";
import { logoutAction } from "../../lib/actions/auth";
import { requireUser } from "../../lib/auth";

const nav = [
  ["Dashboard", "/dashboard"],
  ["Incidents", "/incidents"],
  ["Services", "/services"],
  ["Schedules", "/schedules"],
  ["Escalation", "/escalation-policies"],
  ["Teams", "/teams"],
  ["Users", "/users"],
  ["Integrations", "/integrations"],
  ["Settings", "/settings"],
  ["Audit", "/audit"]
];

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const organization = user.memberships[0]?.organization.name ?? "Opsly";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-white/10 bg-slate-950/95 p-6 lg:block">
        <Link href="/dashboard" className="text-2xl font-bold tracking-tight text-white">
          Opsly
        </Link>
        <p className="mt-1 text-sm text-slate-400">{organization}</p>
        <nav className="mt-10 space-y-1">
          {nav.map(([label, href]) => (
            <Link key={href} href={href} className="block rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white">
              {label}
            </Link>
          ))}
        </nav>
        <form action={logoutAction} className="absolute bottom-6 left-6 right-6">
          <p className="mb-3 text-sm text-slate-400">{user.name}</p>
          <button className="w-full rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/10">
            Sign out
          </button>
        </form>
      </aside>
      <main className="lg:pl-72">
        <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
