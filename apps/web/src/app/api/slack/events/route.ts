import { NextResponse } from "next/server";
import { verifySlackRequest } from "@opsly/integrations";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const payload = JSON.parse(rawBody) as { type?: string; challenge?: string };

  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (!verifySlackRequest({ headers: request.headers, rawBody, signingSecret: process.env.SLACK_SIGNING_SECRET ?? "" })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
