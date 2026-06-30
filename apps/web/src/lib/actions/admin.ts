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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 48);
}
