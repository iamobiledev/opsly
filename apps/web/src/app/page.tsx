export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-20">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Opsly</p>
        <h1 className="max-w-4xl text-5xl font-bold tracking-tight md:text-7xl">
          PagerDuty-grade incident response for Sentry, Nightwatch, and Slack.
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-slate-300">
          Route ROWS frontend and backend alerts into deduplicated incidents, notify the right on-call responders,
          and coordinate acknowledgement, escalation, and resolution from the dashboard or Slack.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ["Sentry", "Rows frontend issue webhooks with raw-body HMAC verification."],
            ["Nightwatch", "Laravel backend exceptions and slow routes mapped to incidents."],
            ["Slack", "Incident cards, slash commands, and interactive ack/resolve actions."]
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
