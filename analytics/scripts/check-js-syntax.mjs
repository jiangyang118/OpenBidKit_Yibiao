import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const roots = process.argv.slice(2);
const ignoredDirs = new Set(['node_modules', '.wrangler', 'dist', 'coverage']);

if (!roots.length) {
  console.error('Usage: node check-js-syntax.mjs <path> [path...]');
  process.exit(1);
}

function collectFiles(targetPath, files = []) {
  const stat = statSync(targetPath);
  if (stat.isFile()) {
    if (targetPath.endsWith('.js') || targetPath.endsWith('.mjs')) {
      files.push(targetPath);
    }
    return files;
  }
  if (!stat.isDirectory()) return files;

  for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    collectFiles(resolve(targetPath, entry.name), files);
  }
  return files;
}

const files = roots.flatMap((root) => collectFiles(resolve(process.cwd(), root))).sort();
if (!files.length) {
  console.log('No JavaScript files found for syntax check.');
  process.exit(0);
}

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.exit(result.status ?? 1);
  }
}

console.log(`Checked ${files.length} JavaScript files.`);
