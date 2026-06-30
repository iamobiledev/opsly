"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acknowledgeIncident, addIncidentNote, assignIncident, escalateIncident, resolveIncident } from "@opsly/core";
import { prisma } from "@opsly/db";
import { requireUser } from "../auth";
import { enqueueSlackUpdate } from "../queues";

export async function ackIncidentAction(formData: FormData) {
  const user = await requireUser();
  const incidentId = String(formData.get("incidentId"));
  await acknowledgeIncident(incidentId, { type: "user", id: user.id, displayName: user.name });
  await enqueueSlackUpdate(incidentId);
  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath("/dashboard");
}

export async function resolveIncidentAction(formData: FormData) {
  const user = await requireUser();
  const incidentId = String(formData.get("incidentId"));
  await resolveIncident(incidentId, { type: "user", id: user.id, displayName: user.name });
  await enqueueSlackUpdate(incidentId);
  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath("/dashboard");
}

export async function escalateIncidentAction(formData: FormData) {
  const user = await requireUser();
  const incidentId = String(formData.get("incidentId"));
  await escalateIncident(incidentId, { type: "user", id: user.id, displayName: user.name });
  await enqueueSlackUpdate(incidentId);
  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath("/dashboard");
}

export async function assignToMeAction(formData: FormData) {
  const user = await requireUser();
  const incidentId = String(formData.get("incidentId"));
  await assignIncident(incidentId, user.id, { type: "user", id: user.id, displayName: user.name });
  await enqueueSlackUpdate(incidentId);
  revalidatePath(`/incidents/${incidentId}`);
}

export async function addNoteAction(formData: FormData) {
  const user = await requireUser();
  const incidentId = String(formData.get("incidentId"));
  const body = String(formData.get("body") ?? "").trim();
  if (body) {
    await addIncidentNote(incidentId, user.id, body);
  }
  revalidatePath(`/incidents/${incidentId}`);
}

export async function savePostmortemAction(formData: FormData) {
  const user = await requireUser();
  const incidentId = String(formData.get("incidentId"));
  const summary = String(formData.get("summary") ?? "");
  const impact = String(formData.get("impact") ?? "");
  const rootCause = String(formData.get("rootCause") ?? "");
  const resolution = String(formData.get("resolution") ?? "");
  const status = String(formData.get("status") ?? "draft");

  await prisma.incidentPostmortem.upsert({
    where: { incidentId },
    create: {
      incidentId,
      status,
      summary,
      impact,
      rootCause,
      resolution
    },
    update: {
      status,
      summary,
      impact,
      rootCause,
      resolution
    }
  });

  await prisma.incidentTimelineEntry.create({
    data: {
      incidentId,
      actorType: "user",
      actorUserId: user.id,
      action: "incident.postmortem_saved",
      message: `${user.name} saved the postmortem`,
      metadataJson: { status } as never
    }
  });

  revalidatePath(`/incidents/${incidentId}`);
}

export async function goIncident(incidentId: string) {
  redirect(`/incidents/${incidentId}`);
}
