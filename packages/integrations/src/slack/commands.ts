export type OpslySlackCommand =
  | { type: "list_incidents" }
  | { type: "show_incident"; incidentRef: string }
  | { type: "ack"; incidentRef: string }
  | { type: "resolve"; incidentRef: string; note?: string }
  | { type: "escalate"; incidentRef: string }
  | { type: "oncall"; target?: string }
  | { type: "trigger"; title: string }
  | { type: "help" };

export function parseOpslyCommand(text: string): OpslySlackCommand {
  const [verb = "help", ...rest] = text.trim().split(/\s+/);
  const remainder = rest.join(" ").trim();

  switch (verb.toLowerCase()) {
    case "":
    case "incidents":
      return { type: "list_incidents" };
    case "incident":
      return rest[0] ? { type: "show_incident", incidentRef: rest[0] } : { type: "help" };
    case "ack":
      return rest[0] ? { type: "ack", incidentRef: rest[0] } : { type: "help" };
    case "resolve":
      return rest[0] ? { type: "resolve", incidentRef: rest[0], note: rest.slice(1).join(" ") || undefined } : { type: "help" };
    case "escalate":
      return rest[0] ? { type: "escalate", incidentRef: rest[0] } : { type: "help" };
    case "oncall":
      return { type: "oncall", target: remainder || undefined };
    case "trigger":
      return remainder ? { type: "trigger", title: remainder } : { type: "help" };
    default:
      return { type: "help" };
  }
}

export function helpText(): string {
  return [
    "*Opsly commands*",
    "• `/opsly incidents` — list active incidents",
    "• `/opsly incident <id>` — show one incident",
    "• `/opsly ack <id>` — acknowledge",
    "• `/opsly resolve <id> [note]` — resolve",
    "• `/opsly escalate <id>` — escalate",
    "• `/opsly oncall [team/service]` — show on-call",
    "• `/opsly trigger <title>` — manually trigger"
  ].join("\n");
}
