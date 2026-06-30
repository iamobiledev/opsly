import { WebClient } from "@slack/web-api";

export function slackClient(token: string): WebClient {
  return new WebClient(token);
}

export async function postSlackIncidentMessage({
  token,
  channel,
  text,
  blocks
}: {
  token: string;
  channel: string;
  text: string;
  blocks: unknown[];
}) {
  const client = slackClient(token);
  return client.chat.postMessage({
    channel,
    text,
    blocks: blocks as never
  });
}

export async function updateSlackIncidentMessage({
  token,
  channel,
  ts,
  text,
  blocks
}: {
  token: string;
  channel: string;
  ts: string;
  text: string;
  blocks: unknown[];
}) {
  const client = slackClient(token);
  return client.chat.update({
    channel,
    ts,
    text,
    blocks: blocks as never
  });
}
