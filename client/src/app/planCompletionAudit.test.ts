import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAppMenuItems, getSectionOrder } from './menuConfig';
import type { AppMenuItem, SectionId } from '../shared/types/navigation';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(currentDir, '../..');

const requiredSections: SectionId[] = [
  'technical-plan',
  'existing-plan-expansion',
  'business-bid',
  'document-knowledge-base',
  'image-knowledge-base',
  'duplicate-check',
  'rejection-check',
  'ai-evaluation',
  'export-format',
  'bid-opportunity',
  'bid-market-analysis',
  'resources',
  'developer-json-test',
  'developer-prompt-lab',
  'developer-parser-sandbox',
  'developer-export-preview',
];

function flattenMenuItems(items: AppMenuItem[]): AppMenuItem[] {
  return items.flatMap((item) => [item, ...(item.children || [])]);
}

describe('plan completion audit', () => {
  it('keeps all planned product and developer entries available without development notices', () => {
    const order = getSectionOrder(true);
    const allItems = flattenMenuItems(getAppMenuItems(true));

    for (const section of requiredSections) {
      expect(order).toContain(section);
    }

    expect(allItems.filter((item) => item.notice).map((item) => item.id)).toEqual([]);
  });

  it('keeps developer tools on the real page implementation instead of the old demo shell', () => {
    expect(fs.existsSync(path.join(clientRoot, 'src/features/developer/pages/DeveloperToolsPage.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(clientRoot, 'src/features/developer/pages/DeveloperToolsPage.test.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(clientRoot, 'src/features/developer/pages/DeveloperDemoPage.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(clientRoot, 'src/features/developer/pages/DeveloperDemoPage.test.tsx'))).toBe(false);
  });
});
