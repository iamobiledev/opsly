export interface EscalationRuleInput {
  level: number;
  delayMinutes: number;
  targetType: "user" | "team" | "schedule";
  targetId: string;
}

export interface EscalationPolicyInput {
  id: string;
  repeatCount: number;
  rules: EscalationRuleInput[];
}

export interface EscalationStateInput {
  currentLevel: number;
  repeatCount: number;
}

export interface EscalationStep {
  level: number;
  targetType: "user" | "team" | "schedule";
  targetId: string;
  notifyAt: Date;
  exhausted: boolean;
}

export function nextEscalationStep(
  policy: EscalationPolicyInput,
  state: EscalationStateInput,
  from = new Date()
): EscalationStep | null {
  const rules = [...policy.rules].sort((a, b) => a.level - b.level);
  if (rules.length === 0) {
    return null;
  }

  const nextLevel = state.currentLevel + 1;
  const rule = rules.find((candidate) => candidate.level === nextLevel);

  if (rule) {
    return {
      level: rule.level,
      targetType: rule.targetType,
      targetId: rule.targetId,
      notifyAt: addMinutes(from, rule.delayMinutes),
      exhausted: false
    };
  }

  if (state.repeatCount < policy.repeatCount) {
    const firstRule = rules[0];
    return {
      level: firstRule.level,
      targetType: firstRule.targetType,
      targetId: firstRule.targetId,
      notifyAt: addMinutes(from, firstRule.delayMinutes),
      exhausted: false
    };
  }

  return {
    level: state.currentLevel,
    targetType: rules[rules.length - 1].targetType,
    targetId: rules[rules.length - 1].targetId,
    notifyAt: from,
    exhausted: true
  };
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
