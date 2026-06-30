import type { Severity } from "@opsly/core";

export interface IncidentBlockInput {
  id: string;
  number: number;
  title: string;
  status: string;
  severity: Severity;
  serviceName: string;
  sourceUrl?: string | null;
  appUrl: string;
}

export function incidentBlocks(input: IncidentBlockInput) {
  const incidentUrl = `${input.appUrl.replace(/\/$/, "")}/incidents/${input.id}`;
  const fields = [
    `*Service:*\n${input.serviceName}`,
    `*Status:*\n${input.status}`,
    `*Severity:*\n${severityEmoji(input.severity)} ${input.severity}`,
    `*Incident:*\n#${input.number}`
  ];

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${severityEmoji(input.severity)} #${input.number} ${input.title}`.slice(0, 150)
      }
    },
    {
      type: "section",
      fields: fields.map((text) => ({ type: "mrkdwn", text }))
    },
    {
      type: "actions",
      elements: [
        button("Ack", `ack:${input.id}`, "primary"),
        button("Resolve", `resolve:${input.id}`),
        button("Escalate", `escalate:${input.id}`, "danger"),
        linkButton("Open in Opsly", incidentUrl),
        ...(input.sourceUrl ? [linkButton("Open source alert", input.sourceUrl)] : [])
      ]
    }
  ];
}

export function onCallSummaryBlocks({
  title,
  responders
}: {
  title: string;
  responders: Array<{ name: string; target: string }>;
}) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${title}*\n${responders.map((responder) => `• ${responder.name} — ${responder.target}`).join("\n") || "No responder configured."}`
      }
    }
  ];
}

function button(text: string, value: string, style?: "primary" | "danger") {
  return {
    type: "button",
    text: { type: "plain_text", text },
    value,
    action_id: value.split(":")[0],
    ...(style ? { style } : {})
  };
}

function linkButton(text: string, url: string) {
  return {
    type: "button",
    text: { type: "plain_text", text },
    url
  };
}

function severityEmoji(severity: Severity): string {
  return {
    low: ":large_blue_circle:",
    warning: ":warning:",
    error: ":red_circle:",
    critical: ":rotating_light:"
  }[severity];
}
