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
  'bid-document',
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

  it('keeps complete bid document preload channels covered by workspace database IPC guards', () => {
    const preloadSource = fs.readFileSync(path.join(clientRoot, 'electron/preload.cjs'), 'utf8');
    const ipcIndexSource = fs.readFileSync(path.join(clientRoot, 'electron/ipc/index.cjs'), 'utf8');
    const preloadBidDocumentChannels = Array.from(preloadSource.matchAll(/ipcRenderer\.invoke\('bid-document:([^']+)'/g))
      .map((match) => `bid-document:${match[1]}`);

    expect(preloadBidDocumentChannels).toEqual(expect.arrayContaining([
      'bid-document:export-readiness-report',
      'bid-document:export-asset-collection-package',
      'bid-document:import-asset-collection-package',
    ]));
    for (const channel of preloadBidDocumentChannels) {
      expect(ipcIndexSource).toContain(`'${channel}'`);
    }
  });

  it('keeps complete bid document preload methods declared in the renderer IPC type', () => {
    const preloadSource = fs.readFileSync(path.join(clientRoot, 'electron/preload.cjs'), 'utf8');
    const ipcTypesSource = fs.readFileSync(path.join(clientRoot, 'src/shared/types/ipc.ts'), 'utf8');
    const bidDocumentBlock = preloadSource.match(/bidDocument:\s*\{([\s\S]*?)\n\s{2}\},\n\s{2}bidOpportunity:/)?.[1] || '';
    const preloadBidDocumentMethods = Array.from(bidDocumentBlock.matchAll(/^\s{4}([a-zA-Z0-9]+):\s*\(/gm))
      .map((match) => match[1])

    for (const method of preloadBidDocumentMethods) {
      expect(ipcTypesSource).toContain(`${method}:`);
    }
    expect(ipcTypesSource).toContain("'assetPackage'");
  });

  it('keeps the P0 bid document plan aligned with the current generic default and build log contract', () => {
    const planSource = fs.readFileSync(path.resolve(clientRoot, '../plan.md'), 'utf8');
    const templatesSource = fs.readFileSync(path.join(clientRoot, 'electron/services/bidDocumentTemplates.cjs'), 'utf8');
    const bidDocumentTypesSource = fs.readFileSync(path.join(clientRoot, 'src/features/bid-document/types.ts'), 'utf8');
    const validationSource = fs.readFileSync(path.join(clientRoot, 'electron/services/bidDocumentValidation.cjs'), 'utf8');
    const projectConfigSource = fs.readFileSync(path.join(clientRoot, 'electron/services/bidDocumentProjectConfig.cjs'), 'utf8');
    const readinessSource = fs.readFileSync(path.join(clientRoot, 'electron/services/bidDocumentReadinessReport.cjs'), 'utf8');
    const requiredBuildLogChecks = [
      'templateCheck',
      'quoteCheck',
      'paymentCheck',
      'titleCheck',
      'identityCheck',
      'forbiddenWordsCheck',
      'assetCheck',
      'sectionSelectionCheck',
      'sectionCheck',
      'docxOpenCheck',
      'docxContentCheck',
      'docxSectionOrderCheck',
      'docxTableCheck',
      'docxQuoteIntegrityCheck',
      'docxLayoutCheck',
      'docxTocCheck',
      'docxStyleCheck',
      'docxTechnicalDensityCheck',
      'docxPageBreakCheck',
      'imageInsertionCheck',
      'docxAssetPlacementCheck',
      'docxForbiddenWordsCheck',
    ];
    const requiredValidationFunctions = [
      'validateBidDocumentProject',
      'validateTemplateDefinition',
      'validateQuoteTotals',
      'validatePaymentTerms',
      'validateProjectIdentity',
      'validateAssets',
      'validateForbiddenWords',
      'validateRequiredSections',
      'validateDocxOpenable',
      'validateDocxContent',
      'validateDocxQuoteIntegrity',
      'validateImagesInserted',
      'validateDocxAssetPlacement',
    ];
    const requiredProjectConfigFunctions = [
      'assertProjectConfigEnvelope',
      'readBidDocumentProjectConfig',
      'resolveProjectConfigAssetMap',
    ];
    const requiredReadinessFunctions = [
      'createReadinessReport',
      'toSnakeReadinessReport',
      'buildQuoteReconciliation',
      'buildQuoteResolutionActions',
      'buildAssetInventory',
      'writeAssetCollectionPackage',
      'readAssetCollectionPackage',
      'applyQuoteResolutionToProject',
      'applyDemoAssetPackageGuard',
    ];

    expect(templatesSource).toContain('const DEFAULT_BID_DOCUMENT_TEMPLATE_ID = GENERIC_RESPONSE_TEMPLATE_ID');
    expect(planSource).toContain('默认进入“通用响应文件模板”');
    expect(planSource).toContain('智慧食堂响应文件模板作为显式可选蓝本');
    expect(planSource).not.toContain('默认先提供“智慧食堂响应文件模板”');
    for (const check of requiredBuildLogChecks) {
      expect(planSource).toContain(`${check}: ValidationResult`);
      expect(bidDocumentTypesSource).toContain(`${check}: BidDocumentValidationResult`);
    }
    expect(planSource).toContain('quoteResolutionCheck?: ValidationResult');
    expect(bidDocumentTypesSource).toContain('quoteResolutionCheck?: BidDocumentValidationResult');
    for (const functionName of requiredValidationFunctions) {
      expect(planSource).toContain(functionName);
      expect(validationSource).toContain(functionName);
    }
    for (const functionName of requiredProjectConfigFunctions) {
      expect(planSource).toContain(functionName);
      expect(projectConfigSource).toContain(functionName);
    }
    for (const functionName of requiredReadinessFunctions) {
      expect(planSource).toContain(functionName);
      expect(readinessSource).toContain(functionName);
    }
  });
});
