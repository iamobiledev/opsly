import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { decryptSecret, redactPayload } from "@opsly/core";
import { prisma } from "@opsly/db";
import { verifyNightwatchWebhook } from "@opsly/integrations";
import { enqueueInboundEvent } from "../../../../../lib/queues";

export async function POST(request: Request, { params }: { params: Promise<{ routingKey: string }> }) {
  const { routingKey } = await params;
  const integration = await prisma.integration.findUnique({
    where: { routingKey },
    include: { organization: true }
  });

  if (!integration || integration.type !== "nightwatch" || !integration.enabled) {
    return NextResponse.json({ error: "Unknown integration" }, { status: 404 });
  }

  const rawBody = await request.text();
  const secret = decryptSecret(integration.secretEncrypted ?? "env:NIGHTWATCH_WEBHOOK_SECRET");

  if (!verifyNightwatchWebhook({ headers: request.headers, rawBody, secret })) {
    await recordRejected(integration.organizationId, integration.id, rawBody, Object.fromEntries(request.headers), "invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  const inbound = await prisma.inboundEvent.upsert({
    where: { provider_payloadHash: { provider: "nightwatch", payloadHash: sha(rawBody) } },
    create: {
      organizationId: integration.organizationId,
      integrationId: integration.id,
      provider: "nightwatch",
      providerEventId: typeof payload.event === "string" ? `${payload.event}:${payload.timestamp ?? ""}` : undefined,
      providerIssueId: extractProviderIssueId(payload),
      headersJson: headersForStorage(request.headers) as never,
      payloadRedactedJson: redactPayload(payload) as never,
      payloadHash: sha(rawBody),
      status: "received"
    },
    update: { status: "duplicate" }
  });

  if (inbound.status === "received") {
    await enqueueInboundEvent(inbound.id);
  }

  return NextResponse.json({ ok: true, inboundEventId: inbound.id }, { status: 202 });
}

async function recordRejected(organizationId: string, integrationId: string, rawBody: string, headers: Record<string, string>, error: string) {
  await prisma.inboundEvent.create({
    data: {
      organizationId,
      integrationId,
      provider: "nightwatch",
      headersJson: headers as never,
      payloadHash: sha(rawBody),
      status: "rejected",
      error
    }
  });
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function headersForStorage(headers: Headers): Record<string, string> {
  const entries = Object.fromEntries(headers);
  delete entries.authorization;
  delete entries.cookie;
  return entries;
}

function extractProviderIssueId(payload: Record<string, unknown>): string | undefined {
  const body = payload.payload as Record<string, unknown> | undefined;
  const issue = body?.issue as Record<string, unknown> | undefined;
  return typeof issue?.id === "string" ? issue.id : undefined;
}
