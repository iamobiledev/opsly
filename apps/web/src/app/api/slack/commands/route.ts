import { NextResponse } from "next/server";
import { acknowledgeIncident, createOrUpdateIncidentFromSignal, resolveIncident, escalateIncident, resolveOnCall } from "@opsly/core";
import { helpText, parseOpslyCommand, verifySlackRequest } from "@opsly/integrations";
import { prisma } from "@opsly/db";
import { enqueueSlackUpdate } from "../../../../lib/queues";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySlackRequest({ headers: request.headers, rawBody, signingSecret: process.env.SLACK_SIGNING_SECRET ?? "" })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const command = parseOpslyCommand(form.get("text") ?? "");
  const slackUserId = form.get("user_id") ?? undefined;

  if (command.type === "list_incidents") {
    const incidents = await prisma.incident.findMany({
      where: { status: { in: ["triggered", "acknowledged"] } },
      include: { service: true },
      orderBy: { createdAt: "desc" },
      take: 10
    });
    return slackText(
      incidents.length
        ? incidents.map((incident) => `#${incident.number} ${incident.status} ${incident.severity} — ${incident.service.name} — ${incident.title}`).join("\n")
        : "No active incidents."
    );
  }

  if (command.type === "help") {
    return slackText(helpText());
  }

  if (command.type === "show_incident") {
    const incident = await findIncident(command.incidentRef);
    if (!incident) {
      return slackText(`Could not find incident ${command.incidentRef}.`);
    }
    return slackText(formatIncident(incident));
  }

  if (command.type === "oncall") {
    const schedules = await prisma.schedule.findMany({
      where: command.target
        ? {
            OR: [
              { name: { contains: command.target, mode: "insensitive" } },
              { team: { name: { contains: command.target, mode: "insensitive" } } }
            ]
          }
        : undefined,
      include: {
        team: true,
        overrides: true,
        layers: { include: { participants: { include: { user: true } } } }
      },
      take: 10
    });

    return slackText(
      schedules.length
        ? schedules
            .map((schedule) => {
              const namesById = new Map(schedule.layers.flatMap((layer) => layer.participants.map((participant) => [participant.userId, participant.user.name])));
              const onCall = resolveOnCall({
                id: schedule.id,
                timezone: schedule.timezone,
                overrides: schedule.overrides,
                layers: schedule.layers.map((layer) => ({
                  id: layer.id,
                  startsAt: layer.startsAt,
                  endsAt: layer.endsAt,
                  rotationLengthMinutes: layer.rotationLengthMinutes,
                  participants: layer.participants
                }))
              });
              return `*${schedule.name}* (${schedule.team?.name ?? "no team"}): ${onCall.map((id) => namesById.get(id) ?? id).join(", ") || "no responder"}`;
            })
            .join("\n")
        : "No matching schedules."
    );
  }

  const actorUser = slackUserId ? await prisma.user.findFirst({ where: { slackUserId } }) : null;
  if (!actorUser && ["ack", "resolve", "escalate", "trigger"].includes(command.type)) {
    return slackText("Your Slack user is not linked to an Opsly user yet. Link it in Opsly before mutating incidents.");
  }

  if (command.type === "ack" || command.type === "resolve" || command.type === "escalate") {
    const incident = await findIncident(command.incidentRef);
    if (!incident) {
      return slackText(`Could not find incident ${command.incidentRef}.`);
    }

    const actor = { type: "slack" as const, id: slackUserId, displayName: actorUser?.name ?? form.get("user_name") ?? slackUserId };
    if (command.type === "ack") {
      await acknowledgeIncident(incident.id, actor);
    } else if (command.type === "resolve") {
      await resolveIncident(incident.id, actor);
      if (command.note && actorUser) {
        await prisma.incidentNote.create({ data: { incidentId: incident.id, authorId: actorUser.id, body: command.note } });
      }
    } else {
      await escalateIncident(incident.id, actor);
    }
    await enqueueSlackUpdate(incident.id);
    return slackText(`Incident #${incident.number} ${command.type} recorded.`);
  }

  if (command.type === "trigger") {
    const organization = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    const service = organization
      ? await prisma.service.findFirst({ where: { organizationId: organization.id }, orderBy: { name: "asc" } })
      : null;
    if (!organization || !service) {
      return slackText("No Opsly organization/service is configured yet.");
    }
    const result = await createOrUpdateIncidentFromSignal({
      organizationId: organization.id,
      signal: {
        provider: "slack",
        eventType: "trigger",
        externalId: `slack:${Date.now()}`,
        dedupeKey: `manual:${command.title}`,
        title: command.title,
        message: `Manually triggered from Slack by ${form.get("user_name") ?? slackUserId ?? "unknown user"}`,
        severity: "error",
        serviceHints: { serviceSlug: service.slug },
        occurredAt: new Date(),
        rawSummary: { source: "slack_command" }
      },
      actor: { type: "slack", id: slackUserId, displayName: actorUser?.name ?? form.get("user_name") ?? undefined }
    });
    return slackText(result.incident ? `Triggered incident #${result.incident.number}: ${result.incident.title}` : "Manual trigger was suppressed.");
  }

  return slackText(helpText());
}

function slackText(text: string) {
  return NextResponse.json({ response_type: "ephemeral", text });
}

async function findIncident(ref: string) {
  const number = Number(ref.replace(/^#/, ""));
  return prisma.incident.findFirst({
    where: Number.isFinite(number) ? { OR: [{ id: ref }, { number }] } : { id: ref },
    include: { service: true }
  });
}

function formatIncident(incident: Awaited<ReturnType<typeof findIncident>> & {}) {
  return [
    `*#${incident.number} ${incident.title}*`,
    `Service: ${incident.service.name}`,
    `Status: ${incident.status}`,
    `Severity: ${incident.severity}`,
    incident.sourceUrl ? `Source: ${incident.sourceUrl}` : undefined
  ]
    .filter(Boolean)
    .join("\n");
}
