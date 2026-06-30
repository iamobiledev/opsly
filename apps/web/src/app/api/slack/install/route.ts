import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/auth";

const SLACK_SCOPES = ["chat:write", "commands", "channels:read", "groups:read", "users:read"].join(",");

export async function GET() {
  await requireAdmin();

  const clientId = process.env.SLACK_CLIENT_ID;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (!clientId) {
    return NextResponse.json({ error: "SLACK_CLIENT_ID is not configured" }, { status: 500 });
  }

  const state = randomBytes(24).toString("base64url");
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/slack/oauth/callback`;
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", SLACK_SCOPES);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url);
  response.cookies.set("opsly_slack_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60
  });
  return response;
}
