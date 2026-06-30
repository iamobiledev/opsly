import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { encryptSecret } from "@opsly/core";
import { prisma } from "@opsly/db";
import { requireAdmin } from "../../../../../lib/auth";

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  bot_user_id?: string;
  team?: {
    id?: string;
    name?: string;
  };
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  const organizationId = admin.memberships[0]?.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No organization membership found" }, { status: 403 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("opsly_slack_oauth_state")?.value;

  if (!code || !state || state !== expectedState) {
    return NextResponse.json({ error: "Invalid Slack OAuth state" }, { status: 400 });
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Slack OAuth credentials are not configured" }, { status: 500 });
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/slack/oauth/callback`;
  const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri
    })
  });
  const tokenJson = (await tokenResponse.json()) as SlackOAuthResponse;

  if (!tokenJson.ok || !tokenJson.access_token || !tokenJson.team?.id) {
    return NextResponse.json({ error: tokenJson.error ?? "Slack OAuth failed" }, { status: 400 });
  }

  await prisma.slackInstallation.upsert({
    where: { organizationId_teamId: { organizationId, teamId: tokenJson.team.id } },
    create: {
      organizationId,
      teamId: tokenJson.team.id,
      teamName: tokenJson.team.name ?? tokenJson.team.id,
      botUserId: tokenJson.bot_user_id,
      botTokenEncrypted: encryptSecret(tokenJson.access_token),
      signingSecretEncrypted: process.env.SLACK_SIGNING_SECRET ? "env:SLACK_SIGNING_SECRET" : encryptSecret("")
    },
    update: {
      teamName: tokenJson.team.name ?? tokenJson.team.id,
      botUserId: tokenJson.bot_user_id,
      botTokenEncrypted: encryptSecret(tokenJson.access_token),
      signingSecretEncrypted: process.env.SLACK_SIGNING_SECRET ? "env:SLACK_SIGNING_SECRET" : encryptSecret("")
    }
  });

  await prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId: admin.id,
      actorType: "user",
      action: "slack.installed",
      targetType: "slack_team",
      targetId: tokenJson.team.id,
      metadataJson: { teamName: tokenJson.team.name, botUserId: tokenJson.bot_user_id } as never
    }
  });

  const response = NextResponse.redirect(`${appUrl.replace(/\/$/, "")}/integrations/slack`);
  response.cookies.delete("opsly_slack_oauth_state");
  return response;
}
