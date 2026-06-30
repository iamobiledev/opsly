import { prisma } from "@opsly/db";
import { triggerIntegrationTestIncidentAction } from "../../../../lib/actions/integrations";
import { requireUser } from "../../../../lib/auth";

export default async function SentryIntegrationPage() {
  const user = await requireUser();
  const organizationId = user.memberships[0]?.organizationId;
  const integration = await prisma.integration.findFirst({ where: { organizationId, type: "sentry" }, include: { service: true } });
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/webhooks/sentry/${integration?.routingKey ?? "rows-sentry-frontend"}`;

  return (
    <div>
      <h1 className="text-4xl font-bold">Sentry integration</h1>
      <p className="mt-2 text-slate-400">Use this endpoint for the ROWS Sentry org and `rows-frontend-dev` project.</p>
      <SetupBox webhookUrl={webhookUrl} secret="SENTRY_WEBHOOK_SECRET" />
      {integration ? (
        <form action={triggerIntegrationTestIncidentAction} className="mt-5">
          <input type="hidden" name="integrationId" value={integration.id} />
          <button className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-300">
            Trigger test Sentry incident
          </button>
        </form>
      ) : null}
      <ol className="mt-8 list-decimal space-y-3 pl-5 text-slate-300">
        <li>Create or edit the Sentry internal integration/service hook in org `rows`.</li>
        <li>Subscribe to issue and alert events for project `rows-frontend-dev`.</li>
        <li>Paste the webhook URL above.</li>
        <li>Store the Sentry client secret in Opsly as `SENTRY_WEBHOOK_SECRET`.</li>
        <li>Send a test issue and confirm an Opsly incident appears.</li>
      </ol>
    </div>
  );
}

function SetupBox({ webhookUrl, secret }: { webhookUrl: string; secret: string }) {
  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-slate-400">Webhook URL</p>
      <code className="mt-2 block overflow-auto rounded-xl bg-slate-900 p-4 text-cyan-200">{webhookUrl}</code>
      <p className="mt-4 text-sm text-slate-400">Secret env var</p>
      <code className="mt-2 block rounded-xl bg-slate-900 p-4 text-cyan-200">{secret}</code>
    </div>
  );
}
