import { prisma } from "@opsly/db";
import { requireUser } from "../../../../lib/auth";

export default async function NightwatchIntegrationPage() {
  const user = await requireUser();
  const organizationId = user.memberships[0]?.organizationId;
  const integration = await prisma.integration.findFirst({ where: { organizationId, type: "nightwatch" }, include: { service: true } });
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/webhooks/nightwatch/${integration?.routingKey ?? "rows-nightwatch-backend"}`;

  return (
    <div>
      <h1 className="text-4xl font-bold">Laravel Nightwatch integration</h1>
      <p className="mt-2 text-slate-400">Route Rows Backend Nightwatch issues into Opsly incidents.</p>
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="text-sm text-slate-400">Webhook URL</p>
        <code className="mt-2 block overflow-auto rounded-xl bg-slate-900 p-4 text-cyan-200">{webhookUrl}</code>
        <p className="mt-4 text-sm text-slate-400">Secret env var</p>
        <code className="mt-2 block rounded-xl bg-slate-900 p-4 text-cyan-200">NIGHTWATCH_WEBHOOK_SECRET</code>
      </div>
      <ol className="mt-8 list-decimal space-y-3 pl-5 text-slate-300">
        <li>Open Nightwatch settings for organization `9f2c42a7-1b3e-4886-acc0-275ead62523f`.</li>
        <li>Select application `Rows Backend` / `9f2c42c9-d339-4b43-8eac-00e04871c794`.</li>
        <li>Configure the custom webhook URL above.</li>
        <li>Copy the Nightwatch signing secret into `NIGHTWATCH_WEBHOOK_SECRET`.</li>
        <li>Enable events `issue.opened`, `issue.reopened`, and `issue.resolved`.</li>
      </ol>
    </div>
  );
}
