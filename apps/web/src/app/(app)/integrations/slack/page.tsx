import { prisma } from "@opsly/db";
import { requireUser } from "../../../../lib/auth";

export default async function SlackIntegrationPage() {
  const user = await requireUser();
  const organizationId = user.memberships[0]?.organizationId;
  const bindings = await prisma.slackChannelBinding.findMany({ where: { organizationId }, include: { service: true } });
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  return (
    <div>
      <h1 className="text-4xl font-bold">Slack integration</h1>
      <p className="mt-2 text-slate-400">Configure Slack app events, slash commands, and interactive incident actions.</p>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Endpoint label="Events" value={`${appUrl}/api/slack/events`} />
        <Endpoint label="Interactivity" value={`${appUrl}/api/slack/interactions`} />
        <Endpoint label="Slash command" value={`${appUrl}/api/slack/commands`} />
      </div>
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-xl font-semibold">Channel bindings</h2>
        <div className="mt-4 divide-y divide-white/10">
          {bindings.map((binding) => (
            <div key={binding.id} className="py-4">
              <p className="font-medium">#{binding.channelName}</p>
              <p className="text-sm text-slate-400">{binding.channelId} · {binding.service?.name ?? "Global"} · {binding.mode}</p>
            </div>
          ))}
        </div>
      </div>
      <ol className="mt-8 list-decimal space-y-3 pl-5 text-slate-300">
        <li>Create a Slack app for ROWS and install it into the workspace.</li>
        <li>Set signing secret and bot token in `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN`.</li>
        <li>Configure `/opsly` to point to the slash command endpoint above.</li>
        <li>Enable interactivity and point it to the interactivity endpoint.</li>
        <li>Invite the bot to `#frontend-alerts` and `#backend-alerts`.</li>
      </ol>
    </div>
  );
}

function Endpoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <code className="mt-2 block overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-cyan-200">{value}</code>
    </div>
  );
}
