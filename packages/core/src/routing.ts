import type { InboundSignal, Severity } from "./types";

export interface RoutingCondition {
  provider?: string;
  serviceSlug?: string;
  projectSlug?: string;
  applicationName?: string;
  environmentIn?: string[];
  environmentNotIn?: string[];
  severityIn?: Severity[];
  routeStartsWith?: string;
}

export interface RoutingAction {
  serviceSlug?: string;
  urgency?: Severity;
  suppress?: boolean;
}

export interface RoutingRuleInput {
  id?: string;
  name: string;
  order: number;
  enabled: boolean;
  conditions: RoutingCondition;
  actions: RoutingAction;
}

export interface RoutingDecision {
  serviceSlug?: string;
  urgency: Severity;
  suppressed: boolean;
  matchedRuleNames: string[];
}

export function routeSignal(signal: InboundSignal, rules: RoutingRuleInput[] = []): RoutingDecision {
  const decision: RoutingDecision = {
    serviceSlug: signal.serviceHints.serviceSlug,
    urgency: signal.severity,
    suppressed: false,
    matchedRuleNames: []
  };

  for (const rule of rules.filter((candidate) => candidate.enabled).sort((a, b) => a.order - b.order)) {
    if (!matchesRule(signal, rule.conditions)) {
      continue;
    }

    decision.matchedRuleNames.push(rule.name);

    if (rule.actions.serviceSlug) {
      decision.serviceSlug = rule.actions.serviceSlug;
    }
    if (rule.actions.urgency) {
      decision.urgency = rule.actions.urgency;
    }
    if (rule.actions.suppress) {
      decision.suppressed = true;
    }
  }

  if (!decision.serviceSlug) {
    decision.serviceSlug = defaultServiceForSignal(signal);
  }

  return decision;
}

export function matchesRule(signal: InboundSignal, condition: RoutingCondition): boolean {
  if (condition.provider && condition.provider !== signal.provider) {
    return false;
  }
  if (condition.serviceSlug && condition.serviceSlug !== signal.serviceHints.serviceSlug) {
    return false;
  }
  if (condition.projectSlug && condition.projectSlug !== signal.serviceHints.projectSlug) {
    return false;
  }
  if (condition.applicationName && condition.applicationName !== signal.serviceHints.applicationName) {
    return false;
  }
  if (condition.environmentIn?.length && (!signal.environment || !condition.environmentIn.includes(signal.environment))) {
    return false;
  }
  if (condition.environmentNotIn?.length && signal.environment && condition.environmentNotIn.includes(signal.environment)) {
    return false;
  }
  if (condition.severityIn?.length && !condition.severityIn.includes(signal.severity)) {
    return false;
  }

  const route = String(signal.rawSummary.route ?? signal.rawSummary.path ?? "");
  if (condition.routeStartsWith && !route.startsWith(condition.routeStartsWith)) {
    return false;
  }

  return true;
}

export function defaultServiceForSignal(signal: InboundSignal): string {
  if (signal.provider === "sentry" || signal.serviceHints.projectSlug === "rows-frontend-dev") {
    return "rows-frontend";
  }

  if (signal.provider === "nightwatch" || signal.serviceHints.applicationName === "Rows Backend") {
    return "rows-backend";
  }

  return "operations";
}
