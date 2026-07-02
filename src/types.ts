export type Role = 'admin' | 'responder';
export type Urgency = 'high' | 'low';
export type IncidentStatus = 'triggered' | 'acknowledged' | 'resolved';
export type RotationType = 'daily' | 'weekly' | 'custom';
export type TargetType = 'user' | 'schedule';

export interface User {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  timezone: string;
  slack_user_id: string | null;
  created_at: string;
}

export interface EscalationTarget {
  id: string;
  level_id: string;
  target_type: TargetType;
  target_id: string;
}

export interface EscalationLevel {
  id: string;
  policy_id: string;
  level_index: number;
  timeout_minutes: number;
  targets: EscalationTarget[];
}

export interface EscalationPolicy {
  id: string;
  name: string;
  description: string | null;
  repeat_count: number;
  created_at: string;
  levels: EscalationLevel[];
}

export interface ScheduleLayer {
  id: string;
  schedule_id: string;
  name: string;
  position: number;
  rotation_type: RotationType;
  shift_length_hours: number | null;
  handoff_time: string; // HH:mm in schedule timezone
  anchor_date: string; // YYYY-MM-DD in schedule timezone
  restriction_start: string | null; // HH:mm
  restriction_end: string | null; // HH:mm
  user_ids: string[]; // rotation order
}

export interface Schedule {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  created_at: string;
  layers: ScheduleLayer[];
}

export interface ScheduleOverride {
  id: string;
  schedule_id: string;
  user_id: string;
  start_at: string;
  end_at: string;
  created_at: string;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  escalation_policy_id: string | null;
  slack_channel_id: string | null;
  default_urgency: Urgency;
  created_at: string;
}

export interface ServiceIntegration {
  id: string;
  service_id: string;
  name: string;
  routing_key: string;
  created_at: string;
}

export interface Incident {
  id: string;
  number: number;
  service_id: string;
  title: string;
  description: string | null;
  urgency: Urgency;
  status: IncidentStatus;
  source: string | null;
  dedup_key: string | null;
  alert_count: number;
  escalation_policy_id: string | null;
  escalation_level: number;
  escalation_repeats_done: number;
  next_escalation_at: string | null;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
}

export type IncidentEventType =
  | 'triggered'
  | 'alert'
  | 'acknowledged'
  | 'resolved'
  | 'escalated'
  | 'assigned'
  | 'note'
  | 'escalation_exhausted';

export interface IncidentEvent {
  id: string;
  incident_id: string;
  type: IncidentEventType;
  actor_user_id: string | null;
  message: string | null;
  created_at: string;
}

export interface IncidentMessageRef {
  id: string;
  incident_id: string;
  channel_id: string;
  ts: string;
  kind: 'channel' | 'dm';
}

/** An on-call result: who is on call and why. */
export interface OnCallResult {
  user_id: string;
  source: 'override' | 'layer';
  layer_id: string | null;
  override_id: string | null;
}

/** A rendered shift for display (schedule previews). */
export interface RenderedShift {
  user_id: string;
  start: string;
  end: string;
  source: 'override' | 'layer';
}

export type NotifyKind =
  | 'triggered'
  | 'acknowledged'
  | 'resolved'
  | 'escalated'
  | 'reassigned'
  | 'note';

export interface NotifyEvent {
  kind: NotifyKind;
  incident: Incident;
  /** Users currently assigned (hydrated). */
  assignees: User[];
  service: Service;
  /** For 'note' events, the note content. */
  note?: string;
  /** Human-readable summary of what happened, e.g. "Escalated to level 2". */
  summary: string;
  /** Actor, when a person did it. */
  actor?: User | null;
}

export interface Notifier {
  notify(event: NotifyEvent): Promise<void>;
}
