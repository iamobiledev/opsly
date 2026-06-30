import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@opsly/db";
import { SeverityBadge, StatusBadge } from "../../../../components/badges";
import {
  ackIncidentAction,
  addNoteAction,
  assignToMeAction,
  escalateIncidentAction,
  resolveIncidentAction
} from "../../../../lib/actions/incidents";
import { requireUser } from "../../../../lib/auth";

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const incident = await prisma.incident.findUnique({
    where: { id },
    include: {
      service: true,
      alerts: { orderBy: { createdAt: "desc" } },
      timeline: { orderBy: { createdAt: "desc" } },
      notes: { include: { author: true }, orderBy: { createdAt: "desc" } }
    }
  });

  if (!incident) {
    notFound();
  }

  return (
    <div>
      <Link href="/incidents" className="text-sm text-cyan-300 hover:text-cyan-200">← All incidents</Link>
      <div className="mt-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm text-slate-400">#{incident.number}</span>
            <StatusBadge status={incident.status} />
            <SeverityBadge severity={incident.severity} />
            <span className="text-sm text-slate-400">{incident.service.name}</span>
          </div>
          <h1 className="mt-4 max-w-4xl text-4xl font-bold">{incident.title}</h1>
          <p className="mt-4 max-w-3xl text-slate-300">{incident.description}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <IncidentButton action={ackIncidentAction} incidentId={incident.id} label="Acknowledge" disabled={incident.status === "resolved"} />
          <IncidentButton action={assignToMeAction} incidentId={incident.id} label="Assign to me" disabled={incident.status === "resolved"} />
          <IncidentButton action={resolveIncidentAction} incidentId={incident.id} label="Resolve" disabled={incident.status === "resolved"} />
          <IncidentButton action={escalateIncidentAction} incidentId={incident.id} label="Escalate" disabled={incident.status === "resolved"} danger />
        </div>
      </div>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div className="space-y-6">
          <Panel title="Timeline">
            <div className="space-y-4">
              {incident.timeline.map((entry) => (
                <div key={entry.id} className="rounded-xl bg-slate-900/80 p-4">
                  <p className="font-medium">{entry.message}</p>
                  <p className="mt-1 text-xs text-slate-400">{entry.action} · {entry.actorType} · {entry.createdAt.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Alerts">
            <div className="space-y-4">
              {incident.alerts.map((alert) => (
                <div key={alert.id} className="rounded-xl bg-slate-900/80 p-4">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={alert.severity} />
                    <span className="text-xs uppercase tracking-wide text-slate-400">{alert.provider}</span>
                  </div>
                  <p className="mt-3 font-medium">{alert.title}</p>
                  <p className="mt-1 text-sm text-slate-400">{alert.message}</p>
                  {alert.sourceUrl ? <a className="mt-3 inline-block text-sm text-cyan-300" href={alert.sourceUrl}>Open source alert</a> : null}
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Add note">
            <form action={addNoteAction}>
              <input type="hidden" name="incidentId" value={incident.id} />
              <textarea
                required
                name="body"
                rows={5}
                className="w-full rounded-xl border border-white/10 bg-slate-900 p-3 text-sm outline-none ring-cyan-400/40 focus:ring"
                placeholder="What changed? What did you try?"
              />
              <button className="mt-3 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">Add note</button>
            </form>
          </Panel>
          <Panel title="Notes">
            <div className="space-y-3">
              {incident.notes.map((note) => (
                <div key={note.id} className="rounded-xl bg-slate-900/80 p-4">
                  <p className="text-sm">{note.body}</p>
                  <p className="mt-2 text-xs text-slate-400">{note.author.name} · {note.createdAt.toLocaleString()}</p>
                </div>
              ))}
              {incident.notes.length === 0 ? <p className="text-sm text-slate-400">No notes yet.</p> : null}
            </div>
          </Panel>
        </div>
      </section>
    </div>
  );
}

function IncidentButton({
  action,
  incidentId,
  label,
  disabled,
  danger = false
}: {
  action: (formData: FormData) => Promise<void>;
  incidentId: string;
  label: string;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="incidentId" value={incidentId} />
      <button
        disabled={disabled}
        className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
          danger ? "bg-red-500 text-white hover:bg-red-400" : "bg-white text-slate-950 hover:bg-slate-200"
        }`}
      >
        {label}
      </button>
    </form>
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
