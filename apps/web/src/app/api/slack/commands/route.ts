import { NextResponse } from "next/server";
import { helpText, parseOpslyCommand, verifySlackRequest } from "@opsly/integrations";
import { prisma } from "@opsly/db";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySlackRequest({ headers: request.headers, rawBody, signingSecret: process.env.SLACK_SIGNING_SECRET ?? "" })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const command = parseOpslyCommand(form.get("text") ?? "");

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

  return slackText(`Received \`${command.type}\`. Interactive incident mutation is available from Opsly incident cards.`);
}

function slackText(text: string) {
  return NextResponse.json({ response_type: "ephemeral", text });
}
