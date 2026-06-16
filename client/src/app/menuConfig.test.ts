import { describe, expect, it } from 'vitest';
import { appMenuItems, getAppMenuItemById, getAppMenuItems, getSectionOrder } from './menuConfig';

describe('app menu configuration', () => {
  it('keeps core product sections discoverable', () => {
    const order = getSectionOrder(false);

    expect(order).toContain('technical-plan');
    expect(order).toContain('existing-plan-expansion');
    expect(order).toContain('document-knowledge-base');
    expect(order).toContain('duplicate-check');
    expect(order).toContain('rejection-check');
    expect(order).toContain('export-format');
    expect(order).toContain('bid-opportunity');
    expect(order).toContain('bid-market-analysis');
    expect(order).toContain('resources');
  });

  it('exposes developer tools only in developer mode', () => {
    expect(getSectionOrder(false)).not.toContain('developer-json-test');
    expect(getSectionOrder(true)).toEqual(expect.arrayContaining([
      'developer-test',
      'developer-json-test',
      'developer-prompt-lab',
      'developer-parser-sandbox',
      'developer-export-preview',
    ]));
  });

  it('keeps P0 product entries visible without development notices', () => {
    const children = appMenuItems.flatMap((item) => item.children || []);

    expect(children.find((child) => child.id === 'business-bid')?.notice).toBeUndefined();
    expect(children.find((child) => child.id === 'image-knowledge-base')?.notice).toBeUndefined();
    expect(children.find((child) => child.id === 'ai-evaluation')?.notice).toBeUndefined();
    expect(getAppMenuItemById('bid-opportunity', false)?.notice).toBeUndefined();
    expect(getAppMenuItemById('bid-market-analysis', false)?.notice).toBeUndefined();
  });

  it('adds developer menu without mutating the base menu list', () => {
    const baseCount = getAppMenuItems(false).length;
    const developerCount = getAppMenuItems(true).length;

    expect(developerCount).toBe(baseCount + 1);
    expect(getAppMenuItems(false).some((item) => item.id === 'developer-test')).toBe(false);
  });
});
