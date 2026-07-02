import type { AppCtx } from '../context.js';
import { sweepEscalations } from '../domain/incidents.js';

/**
 * Periodically escalates incidents whose acknowledgement timeout has passed.
 * State lives in the DB (incidents.next_escalation_at), so restarts are safe:
 * anything overdue is picked up on the next sweep.
 */
export function startEscalationEngine(ctx: AppCtx): () => void {
  const intervalMs = ctx.config.escalationSweepSeconds * 1000;
  const timer = setInterval(() => {
    try {
      const moved = sweepEscalations(ctx);
      if (moved > 0) console.log(`[escalation] escalated ${moved} incident(s)`);
    } catch (err) {
      console.error('[escalation] sweep failed:', err);
    }
  }, intervalMs);
  timer.unref();
  console.log(`[escalation] engine running (every ${ctx.config.escalationSweepSeconds}s)`);
  return () => clearInterval(timer);
}
