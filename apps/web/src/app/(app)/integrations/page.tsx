import Link from "next/link";
import { prisma } from "@opsly/db";
import { createIntegrationAction } from "../../../lib/actions/admin";
import { requireUser } from "../../../lib/auth";

export default async function IntegrationsPage() {
  const user = await requireUser();
  const organizationId = user.memberships[0]?.organizationId;
  const integrations = await prisma.integration.findMany({
    where: { organizationId },
    include: { service: true },
    orderBy: { type: "asc" }
  });
  const services = await prisma.service.findMany({ where: { organizationId }, orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="text-4xl font-bold">Integrations</h1>
      <p className="mt-2 text-slate-400">Connect alert sources and responder workflows.</p>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <IntegrationCard title="Sentry" href="/integrations/sentry" body="Rows frontend issue and error webhooks." />
        <IntegrationCard title="Nightwatch" href="/integrations/nightwatch" body="Laravel backend exceptions, slow routes, and status changes." />
        <IntegrationCard title="Slack" href="/integrations/slack" body="Incident notifications, buttons, and slash commands." />
      </div>
      <form action={createIntegrationAction} className="mt-8 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 lg:grid-cols-3">
        <input name="name" required placeholder="Integration name" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
        <input name="routingKey" placeholder="routing-key" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
        <select name="type" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2">
          <option value="sentry">Sentry</option>
          <option value="nightwatch">Nightwatch</option>
          <option value="slack">Slack</option>
          <option value="generic_webhook">Generic webhook</option>
        </select>
        <select name="serviceId" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2">
          <option value="">No service</option>
          {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
        </select>
        <input name="secretEnv" placeholder="Secret env var (e.g. SENTRY_WEBHOOK_SECRET)" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
        <button className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950">Save integration</button>
      </form>
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-xl font-semibold">Configured sources</h2>
        <div className="mt-4 divide-y divide-white/10">
          {integrations.map((integration) => (
            <div key={integration.id} className="flex items-center justify-between py-4">
              <div>
                <p className="font-medium">{integration.name}</p>
                <p className="text-sm text-slate-400">{integration.type} · {integration.service?.name ?? "No service"}</p>
              </div>
              <code className="rounded-lg bg-slate-900 px-3 py-1 text-xs text-cyan-200">{integration.routingKey}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
    </Link>
  );
}
