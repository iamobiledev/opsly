import { redirect } from "next/navigation";
import { hasAnyUsers } from "../../../lib/auth";
import { setupAction } from "../../../lib/actions/auth";

export default async function SetupPage() {
  if (await hasAnyUsers()) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-white">
      <form action={setupAction} className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Opsly setup</p>
        <h1 className="mt-3 text-3xl font-bold">Create your incident command center</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Bootstrap the first owner account. ROWS defaults can be seeded with `pnpm db:seed`.
        </p>
        <div className="mt-8 space-y-5">
          <Field label="Organization" name="organizationName" defaultValue="ROWS" />
          <Field label="Your name" name="name" defaultValue="Allen Abraham" />
          <Field label="Email" name="email" type="email" defaultValue="allen@rowshr.com" />
          <Field label="Password" name="password" type="password" />
        </div>
        <button className="mt-8 w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-300">
          Create Opsly
        </button>
      </form>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-200">
      {label}
      <input
        required
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none ring-cyan-400/50 focus:ring"
      />
    </label>
  );
}
