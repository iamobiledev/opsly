export interface ScheduleParticipantInput {
  userId: string;
  position: number;
}

export interface ScheduleLayerInput {
  id: string;
  startsAt: Date;
  endsAt?: Date | null;
  rotationLengthMinutes: number;
  participants: ScheduleParticipantInput[];
}

export interface ScheduleOverrideInput {
  userId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ScheduleInput {
  id: string;
  timezone: string;
  layers: ScheduleLayerInput[];
  overrides: ScheduleOverrideInput[];
}

export function resolveOnCall(schedule: ScheduleInput, at = new Date()): string[] {
  const overrideUsers = schedule.overrides
    .filter((override) => override.startsAt <= at && override.endsAt > at)
    .map((override) => override.userId);

  if (overrideUsers.length > 0) {
    return unique(overrideUsers);
  }

  const layerUsers = schedule.layers.flatMap((layer) => resolveLayerOnCall(layer, at));
  return unique(layerUsers);
}

export function resolveLayerOnCall(layer: ScheduleLayerInput, at = new Date()): string[] {
  if (layer.startsAt > at || (layer.endsAt && layer.endsAt <= at)) {
    return [];
  }

  const participants = [...layer.participants].sort((a, b) => a.position - b.position);
  if (participants.length === 0) {
    return [];
  }

  const elapsedMs = at.getTime() - layer.startsAt.getTime();
  const rotationMs = Math.max(1, layer.rotationLengthMinutes) * 60_000;
  const rotationIndex = Math.floor(elapsedMs / rotationMs) % participants.length;
  return [participants[rotationIndex]?.userId].filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
