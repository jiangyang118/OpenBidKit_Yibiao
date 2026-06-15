import type { TechnicalPlanState, TechnicalPlanStep } from '../types';

const validSteps: TechnicalPlanStep[] = [
  'document-analysis',
  'bid-analysis',
  'outline-generation',
  'global-facts',
  'content-edit',
];

export function normalizeTechnicalPlanStep(step: string): TechnicalPlanStep | null {
  if (step === 'expand') return 'content-edit';
  return validSteps.includes(step as TechnicalPlanStep) ? step as TechnicalPlanStep : null;
}

function isTechnicalPlanState(state: TechnicalPlanState | null): state is TechnicalPlanState {
  return Boolean(state && normalizeTechnicalPlanStep(state.step));
}

export const technicalPlanStorage = {
  async load(): Promise<TechnicalPlanState | null> {
    const state = await window.yibiao?.technicalPlan.loadState();

    if (!isTechnicalPlanState(state || null)) {
      return null;
    }

    return state ? { ...state, step: normalizeTechnicalPlanStep(state.step) || 'document-analysis' } : null;
  },
};
