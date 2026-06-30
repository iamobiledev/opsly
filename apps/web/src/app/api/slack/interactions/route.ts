import { NextResponse } from "next/server";
import { acknowledgeIncident, escalateIncident, resolveIncident } from "@opsly/core";
import { verifySlackRequest } from "@opsly/integrations";
import { enqueueSlackUpdate } from "../../../../lib/queues";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySlackRequest({ headers: request.headers, rawBody, signingSecret: process.env.SLACK_SIGNING_SECRET ?? "" })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const payload = JSON.parse(form.get("payload") ?? "{}") as {
    user?: { id?: string; username?: string; name?: string };
    actions?: Array<{ action_id?: string; value?: string }>;
  };
  const action = payload.actions?.[0];
  const [operation, incidentId] = (action?.value ?? "").split(":");
  const actor = {
    type: "slack" as const,
    id: payload.user?.id,
    displayName: payload.user?.username ?? payload.user?.name ?? payload.user?.id
  };

  if (!incidentId) {
    return NextResponse.json({ text: "No incident id found in action payload." });
  }

  if (operation === "ack") {
    await acknowledgeIncident(incidentId, actor);
  } else if (operation === "resolve") {
    await resolveIncident(incidentId, actor);
  } else if (operation === "escalate") {
    await escalateIncident(incidentId, actor);
  }
  await enqueueSlackUpdate(incidentId);

  return NextResponse.json({ text: `Opsly ${operation} recorded.` });
}
