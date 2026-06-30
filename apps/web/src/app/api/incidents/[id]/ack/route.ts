import { NextResponse } from "next/server";
import { acknowledgeIncident } from "@opsly/core";
import { requireUser } from "../../../../../lib/auth";
import { enqueueSlackUpdate } from "../../../../../lib/queues";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const incident = await acknowledgeIncident(id, { type: "user", id: user.id, displayName: user.name });
  await enqueueSlackUpdate(id);
  return NextResponse.json({ ok: true, incident });
}
