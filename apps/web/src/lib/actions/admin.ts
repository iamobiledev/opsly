"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@opsly/db";
import { requireAdmin } from "../auth";

export async function createUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const organizationId = admin.memberships[0]?.organizationId;
  const email = String(formData.get("email") ?? "").toLowerCase();
  const name = String(formData.get("name") ?? "");
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "responder") as "owner" | "admin" | "responder" | "viewer";

  if (!organizationId || !email || !name || !password) {
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, passwordHash },
    update: { name }
  });

  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    create: { organizationId, userId: user.id, role },
    update: { role }
  });

  await prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId: admin.id,
      actorType: "user",
      action: "user.upserted",
      targetType: "user",
      targetId: user.id,
      metadataJson: { role } as never
    }
  });

  revalidatePath("/users");
}

export async function createTeamAction(formData: FormData) {
  const admin = await requireAdmin();
  const organizationId = admin.memberships[0]?.organizationId;
  const name = String(formData.get("name") ?? "");
  const slug = slugify(String(formData.get("slug") ?? name));
  const description = String(formData.get("description") ?? "");

  if (!organizationId || !name || !slug) {
    return;
  }

  await prisma.team.upsert({
    where: { organizationId_slug: { organizationId, slug } },
    create: { organizationId, name, slug, description },
    update: { name, description }
  });

  revalidatePath("/teams");
}

export async function createServiceAction(formData: FormData) {
  const admin = await requireAdmin();
  const organizationId = admin.memberships[0]?.organizationId;
  const name = String(formData.get("name") ?? "");
  const slug = slugify(String(formData.get("slug") ?? name));
  const teamId = String(formData.get("teamId") ?? "") || undefined;
  const escalationPolicyId = String(formData.get("escalationPolicyId") ?? "") || undefined;
  const description = String(formData.get("description") ?? "");
  const defaultUrgency = String(formData.get("defaultUrgency") ?? "error") as "low" | "warning" | "error" | "critical";

  if (!organizationId || !name || !slug) {
    return;
  }

  await prisma.service.upsert({
    where: { organizationId_slug: { organizationId, slug } },
    create: { organizationId, name, slug, teamId, escalationPolicyId, description, defaultUrgency },
    update: { name, teamId, escalationPolicyId, description, defaultUrgency }
  });

  revalidatePath("/services");
}

export async function createEscalationPolicyAction(formData: FormData) {
  const admin = await requireAdmin();
  const organizationId = admin.memberships[0]?.organizationId;
  const name = String(formData.get("name") ?? "");
  const teamId = String(formData.get("teamId") ?? "") || undefined;
  const description = String(formData.get("description") ?? "");

  if (!organizationId || !name) {
    return;
  }

  const policy = await prisma.escalationPolicy.upsert({
    where: { organizationId_name: { organizationId, name } },
    create: { organizationId, teamId, name, description, repeatCount: 1 },
    update: { teamId, description }
  });

  await prisma.escalationRule.upsert({
    where: { policyId_level: { policyId: policy.id, level: 0 } },
    create: {
      policyId: policy.id,
      level: 0,
      delayMinutes: Number(formData.get("delayMinutes") ?? 0),
      targetType: String(formData.get("targetType") ?? "team"),
      targetId: String(formData.get("targetId") ?? teamId ?? "")
    },
    update: {
      delayMinutes: Number(formData.get("delayMinutes") ?? 0),
      targetType: String(formData.get("targetType") ?? "team"),
      targetId: String(formData.get("targetId") ?? teamId ?? "")
    }
  });

  revalidatePath("/escalation-policies");
}

export async function createIntegrationAction(formData: FormData) {
  const admin = await requireAdmin();
  const organizationId = admin.memberships[0]?.organizationId;
  const serviceId = String(formData.get("serviceId") ?? "") || undefined;
  const type = String(formData.get("type") ?? "generic_webhook") as "sentry" | "nightwatch" | "slack" | "generic_webhook";
  const name = String(formData.get("name") ?? "");
  const routingKey = slugify(String(formData.get("routingKey") ?? name));
  const secretEnv = String(formData.get("secretEnv") ?? "").trim();

  if (!organizationId || !name || !routingKey) {
    return;
  }

  await prisma.integration.upsert({
    where: { routingKey },
    create: {
      organizationId,
      serviceId,
      type,
      name,
      routingKey,
      secretEncrypted: secretEnv ? `env:${secretEnv}` : undefined,
      enabled: true
    },
    update: {
      serviceId,
      type,
      name,
      secretEncrypted: secretEnv ? `env:${secretEnv}` : undefined
    }
  });

  revalidatePath("/integrations");
}

export async function createMaintenanceWindowAction(formData: FormData) {
  await requireAdmin();
  const serviceId = String(formData.get("serviceId") ?? "");
  const startsAt = new Date(String(formData.get("startsAt") ?? ""));
  const endsAt = new Date(String(formData.get("endsAt") ?? ""));
  const reason = String(formData.get("reason") ?? "");

  if (!serviceId || !reason || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return;
  }

  await prisma.maintenanceWindow.create({
    data: { serviceId, startsAt, endsAt, reason }
  });

  revalidatePath(`/services/${serviceId}`);
}

export async function createSuppressionRuleAction(formData: FormData) {
  await requireAdmin();
  const serviceId = String(formData.get("serviceId") ?? "");
  const name = String(formData.get("name") ?? "");
  const routeStartsWith = String(formData.get("routeStartsWith") ?? "");
  const environment = String(formData.get("environment") ?? "");

  if (!serviceId || !name) {
    return;
  }

  await prisma.suppressionRule.create({
    data: {
      serviceId,
      name,
      conditionsJson: {
        ...(routeStartsWith ? { routeStartsWith } : {}),
        ...(environment ? { environmentIn: [environment] } : {})
      },
      enabled: true
    }
  });

  revalidatePath(`/services/${serviceId}`);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 48);
}
