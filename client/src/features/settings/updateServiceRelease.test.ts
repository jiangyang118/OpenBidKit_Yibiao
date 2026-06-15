import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml') as {
  dump: (value: unknown) => string;
  load: (value: string) => unknown;
};
const updateService = require('../../../electron/services/updateService.cjs') as {
  __testing: {
    compareVersions: (left: string, right: string) => number;
    normalizeUpdateChannel: (value: string) => 'github' | 'cloudflare';
    pickCloudflareDownloadFileForPlatform: (
      files: Array<{ name: string; url: string }>,
      platform: NodeJS.Platform,
      arch: NodeJS.Architecture,
    ) => { name: string; url: string } | undefined;
  };
};

describe('release and update smoke checks', () => {
  it('selects Cloudflare release files by platform and architecture', () => {
    const files = [
      { name: 'Yibiao-1.2.3-win-x64.zip', url: 'https://cdn.test/win.zip' },
      { name: 'Yibiao-1.2.3-win-x64.exe', url: 'https://cdn.test/win.exe' },
      { name: 'Yibiao-1.2.3-mac-x64-package.zip', url: 'https://cdn.test/mac-x64.zip' },
      { name: 'Yibiao-1.2.3-mac-arm64-package.zip', url: 'https://cdn.test/mac-arm64.zip' },
    ];

    expect(updateService.__testing.pickCloudflareDownloadFileForPlatform(files, 'win32', 'x64')?.url).toBe('https://cdn.test/win.exe');
    expect(updateService.__testing.pickCloudflareDownloadFileForPlatform(files, 'darwin', 'arm64')?.url).toBe('https://cdn.test/mac-arm64.zip');
    expect(updateService.__testing.pickCloudflareDownloadFileForPlatform(files, 'darwin', 'x64')?.url).toBe('https://cdn.test/mac-x64.zip');
    expect(updateService.__testing.pickCloudflareDownloadFileForPlatform(files, 'linux', 'x64')).toBeNull();
  });

  it('keeps update channel and version comparison rules stable', () => {
    expect(updateService.__testing.normalizeUpdateChannel('cloudflare')).toBe('cloudflare');
    expect(updateService.__testing.normalizeUpdateChannel('unexpected')).toBe('github');
    expect(updateService.__testing.compareVersions('v1.2.4', '1.2.3')).toBeGreaterThan(0);
    expect(updateService.__testing.compareVersions('1.2', '1.2.0')).toBe(0);
  });

  it('merges macOS x64 and arm64 update manifests into one latest-mac.yml', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'yibiao-release-'));
    const x64Path = path.join(dir, 'x64.yml');
    const arm64Path = path.join(dir, 'arm64.yml');
    const outputPath = path.join(dir, 'out', 'latest-mac.yml');
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(x64Path, yaml.dump({
      version: '1.2.3',
      path: 'Yibiao-1.2.3-mac-x64.dmg',
      releaseDate: '2026-06-14T00:00:00.000Z',
      files: [
        { url: 'Yibiao-1.2.3-mac-x64.dmg', sha512: 'x64-sha', size: 100 },
      ],
    }), 'utf8');
    writeFileSync(arm64Path, yaml.dump({
      version: '1.2.3',
      path: 'Yibiao-1.2.3-mac-arm64.dmg',
      releaseDate: '2026-06-15T00:00:00.000Z',
      files: [
        { url: 'Yibiao-1.2.3-mac-arm64.dmg', sha512: 'arm64-sha', size: 120 },
      ],
    }), 'utf8');

    execFileSync(process.execPath, [
      path.resolve('scripts/merge-mac-update-manifests.cjs'),
      x64Path,
      arm64Path,
      outputPath,
    ], { cwd: path.resolve('.'), stdio: 'pipe' });

    const merged = yaml.load(readFileSync(outputPath, 'utf8')) as {
      version: string;
      path: string;
      releaseDate: string;
      files: Array<{ url: string; sha512: string; size: number }>;
    };
    expect(merged.version).toBe('1.2.3');
    expect(merged.path).toBe('Yibiao-1.2.3-mac-x64.dmg');
    expect(merged.releaseDate).toBe('2026-06-15T00:00:00.000Z');
    expect(merged.files.map((file) => file.url).sort()).toEqual([
      'Yibiao-1.2.3-mac-arm64.dmg',
      'Yibiao-1.2.3-mac-x64.dmg',
    ]);
  });
});
