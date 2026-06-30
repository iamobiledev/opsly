"use server";

import { revalidatePath } from "next/cache";
import { encryptSecret } from "@opsly/core";
import { prisma } from "@opsly/db";
import { requireUser } from "../auth";

export async function addContactMethodAction(formData: FormData) {
  const user = await requireUser();
  const type = String(formData.get("type") ?? "email");
  const label = String(formData.get("label") ?? type);
  const value = String(formData.get("value") ?? "").trim();

  if (!value) {
    return;
  }

  await prisma.contactMethod.create({
    data: {
      userId: user.id,
      type,
      label,
      valueEncrypted: encryptSecret(value),
      enabled: true
    }
  });

  revalidatePath("/settings");
}

export async function addNotificationRuleAction(formData: FormData) {
  const user = await requireUser();
  const contactMethodId = String(formData.get("contactMethodId") ?? "");
  const delayMinutes = Number(formData.get("delayMinutes") ?? 0);
  const urgency = String(formData.get("urgency") ?? "error") as "low" | "warning" | "error" | "critical";

  const contactMethod = await prisma.contactMethod.findFirst({
    where: { id: contactMethodId, userId: user.id }
  });
  if (!contactMethod) {
    return;
  }

  await prisma.notificationRule.create({
    data: {
      userId: user.id,
      contactMethodId,
      delayMinutes: Number.isFinite(delayMinutes) ? delayMinutes : 0,
      urgency,
      enabled: true
    }
  });

  revalidatePath("/settings");
}
