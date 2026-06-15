import { describe, expect, it } from 'vitest';
import { normalizeTechnicalPlanStep } from './technicalPlanStorage';

describe('technicalPlanStorage', () => {
  it('maps the legacy expand step to content-edit', () => {
    expect(normalizeTechnicalPlanStep('expand')).toBe('content-edit');
  });

  it('rejects unknown technical plan steps', () => {
    expect(normalizeTechnicalPlanStep('unknown-step')).toBeNull();
  });
});
