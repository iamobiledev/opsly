import { DateTime } from 'luxon';
import type { Incident, IncidentStatus, Urgency, User } from '../types.js';

/** Escape text destined for Slack mrkdwn sections. */
export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function statusEmoji(status: IncidentStatus): string {
  switch (status) {
    case 'triggered':
      return '🔴';
    case 'acknowledged':
      return '🟡';
    case 'resolved':
      return '✅';
  }
}

export function statusLabel(status: IncidentStatus): string {
  return status.toUpperCase();
}

export function urgencyLabel(urgency: Urgency): string {
  return urgency === 'high' ? '⚠️ High' : 'Low';
}

/** Mention a user in Slack if linked, otherwise show their name. */
export function fmtUser(user: User | null | undefined): string {
  if (!user) return '_nobody_';
  return user.slack_user_id ? `<@${user.slack_user_id}>` : esc(user.name);
}

export function fmtUsers(users: User[]): string {
  if (!users.length) return '_unassigned_';
  return users.map((u) => fmtUser(u)).join(', ');
}

/** Render an ISO timestamp so each Slack user sees it in their own timezone. */
export function fmtTime(iso: string | null | undefined, style = '{date_short_pretty} {time}'): string {
  if (!iso) return '—';
  const dt = DateTime.fromISO(iso);
  if (!dt.isValid) return esc(iso);
  const unix = Math.floor(dt.toSeconds());
  const fallback = dt.toUTC().toFormat('yyyy-MM-dd HH:mm') + ' UTC';
  return `<!date^${unix}^${style}|${fallback}>`;
}

export function fmtAge(iso: string): string {
  const dt = DateTime.fromISO(iso);
  if (!dt.isValid) return '';
  const mins = Math.max(0, Math.floor(DateTime.utc().diff(dt.toUTC(), 'minutes').minutes));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

export function incidentOneLiner(incident: Incident): string {
  return `${statusEmoji(incident.status)} *#${incident.number}* ${esc(incident.title)}`;
}
