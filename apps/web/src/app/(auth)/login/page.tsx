import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyUsers } from "../../../lib/auth";
import { loginAction } from "../../../lib/actions/auth";

export default async function LoginPage() {
  if (!(await hasAnyUsers())) {
    redirect("/setup");
  }
  if (await getCurrentUser()) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-white">
      <form action={loginAction} className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Opsly</p>
        <h1 className="mt-3 text-3xl font-bold">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Access incidents, schedules, services, and integration settings.
        </p>
        <div className="mt-8 space-y-5">
          <label className="block text-sm font-medium text-slate-200">
            Email
            <input
              required
              name="email"
              type="email"
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none ring-cyan-400/50 focus:ring"
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Password
            <input
              required
              name="password"
              type="password"
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none ring-cyan-400/50 focus:ring"
            />
          </label>
        </div>
        <button className="mt-8 w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-300">
          Sign in
        </button>
      </form>
    </main>
  );
}
