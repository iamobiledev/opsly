import { prisma } from "@opsly/db";
import { addContactMethodAction, addNotificationRuleAction } from "../../../lib/actions/settings";
import { requireUser } from "../../../lib/auth";

export default async function SettingsPage() {
  const user = await requireUser();
  const [contactMethods, notificationRules] = await Promise.all([
    prisma.contactMethod.findMany({ where: { userId: user.id }, orderBy: { label: "asc" } }),
    prisma.notificationRule.findMany({
      where: { userId: user.id },
      include: { contactMethod: true },
      orderBy: { delayMinutes: "asc" }
    })
  ]);

  return (
    <div>
      <h1 className="text-4xl font-bold">Settings</h1>
      <p className="mt-2 text-slate-400">Manage personal contact methods and notification timing.</p>

      <section className="mt-8 grid gap-6 xl:grid-cols-2">
        <Panel title="Contact methods">
          <form action={addContactMethodAction} className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto]">
            <select name="type" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2">
              <option value="email">Email</option>
              <option value="slack">Slack</option>
              <option value="sms">SMS</option>
              <option value="phone">Phone</option>
            </select>
            <input name="label" placeholder="Label" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
            <input name="value" required placeholder="Destination" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
            <button className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950">Add</button>
          </form>
          <div className="mt-5 space-y-3">
            {contactMethods.map((method) => (
              <div key={method.id} className="rounded-xl bg-slate-900/80 p-3">
                <p className="font-medium">{method.label}</p>
                <p className="text-sm text-slate-400">{method.type} · encrypted at rest · {method.enabled ? "enabled" : "disabled"}</p>
              </div>
            ))}
            {contactMethods.length === 0 ? <p className="text-sm text-slate-400">No contact methods configured.</p> : null}
          </div>
        </Panel>

        <Panel title="Notification rules">
          <form action={addNotificationRuleAction} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
            <select name="contactMethodId" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2">
              {contactMethods.map((method) => (
                <option key={method.id} value={method.id}>{method.label}</option>
              ))}
            </select>
            <select name="urgency" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2">
              <option value="low">Low+</option>
              <option value="warning">Warning+</option>
              <option value="error">Error+</option>
              <option value="critical">Critical only</option>
            </select>
            <input name="delayMinutes" type="number" min="0" defaultValue="0" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2" />
            <button className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950">Add</button>
          </form>
          <div className="mt-5 space-y-3">
            {notificationRules.map((rule) => (
              <div key={rule.id} className="rounded-xl bg-slate-900/80 p-3">
                <p className="font-medium">{rule.contactMethod.label}</p>
                <p className="text-sm text-slate-400">
                  Notify after {rule.delayMinutes} min for {rule.urgency}+ incidents · {rule.enabled ? "enabled" : "disabled"}
                </p>
              </div>
            ))}
            {notificationRules.length === 0 ? <p className="text-sm text-slate-400">No notification rules configured.</p> : null}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}
