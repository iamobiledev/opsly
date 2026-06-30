import type { Actor } from "./types";

export interface AuditEntryInput {
  organizationId: string;
  actor: Actor;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export function createAuditEntry(input: AuditEntryInput) {
  return {
    organizationId: input.organizationId,
    actorUserId: input.actor.type === "user" ? input.actor.id : null,
    actorType: input.actor.type,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadataJson: (input.metadata ?? undefined) as never,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null
  };
}
