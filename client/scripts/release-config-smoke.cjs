const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const clientRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(clientRoot, '..');
const packageJson = require(path.join(clientRoot, 'package.json'));
const updateService = require(path.join(clientRoot, 'electron/services/updateService.cjs'));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readWorkflow() {
  const workflowPath = path.join(repoRoot, '.github/workflows/release.yml');
  const raw = fs.readFileSync(workflowPath, 'utf8');
  return {
    raw,
    data: yaml.load(raw, { schema: yaml.JSON_SCHEMA }),
  };
}

function runReleaseConfigSmoke() {
  const workflow = readWorkflow();
  const build = packageJson.build || {};
  const publish = Array.isArray(build.publish) ? build.publish[0] : null;
  const updateTesting = updateService.__testing || {};

  assert(packageJson.version && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(packageJson.version), 'package.json version must be semver-like.');
  assert(packageJson.scripts?.['dist:win']?.includes('electron-builder --win'), 'dist:win must build Windows artifacts.');
  assert(packageJson.scripts?.['dist:mac']?.includes('electron-builder --mac'), 'dist:mac must build macOS artifacts.');
  assert(build.directories?.output === 'release', 'electron-builder output directory must stay client/release.');
  assert(build.artifactName === 'Yibiao-${version}-${os}-${arch}.${ext}', 'artifactName must include version, os and arch for update manifest matching.');
  assert(build.win?.target?.some((target) => target.target === 'nsis' && target.arch?.includes('x64')), 'Windows NSIS x64 target is required.');
  assert(build.win?.target?.some((target) => target.target === 'zip' && target.arch?.includes('x64')), 'Windows ZIP x64 target is required.');
  assert(build.mac?.target?.some((target) => target.target === 'dmg' && target.arch?.includes('x64') && target.arch?.includes('arm64')), 'macOS DMG x64/arm64 targets are required.');
  assert(publish?.provider === 'github' && publish.owner === updateTesting.GITHUB_PROVIDER_OPTIONS?.owner && publish.repo === updateTesting.GITHUB_PROVIDER_OPTIONS?.repo, 'GitHub publish config must match updateService provider.');
  assert(updateTesting.CLOUDFLARE_RELEASE_BASE_URL === 'https://openbidkit-oss.agnet.top/release', 'Cloudflare release base URL changed unexpectedly.');

  assert(workflow.data?.jobs?.['build-windows'], 'release workflow must include build-windows job.');
  assert(workflow.data?.jobs?.['build-macos'], 'release workflow must include build-macos job.');
  assert(workflow.data?.jobs?.['publish-macos'], 'release workflow must include publish-macos job.');
  assert(workflow.data?.jobs?.['publish-r2-release'], 'release workflow must include publish-r2-release job.');
  assert(workflow.raw.includes('npm version "$VERSION" --no-git-tag-version --allow-same-version'), 'release workflow must sync package version from tag.');
  assert(workflow.raw.includes('merge-mac-update-manifests.cjs'), 'release workflow must merge macOS update manifests.');
  assert(workflow.raw.includes('publish-r2-release.mjs'), 'release workflow must publish R2 latest.json.');

  return {
    version: packageJson.version,
    githubRepo: `${publish.owner}/${publish.repo}`,
    cloudflareReleaseBaseUrl: updateTesting.CLOUDFLARE_RELEASE_BASE_URL,
  };
}

if (require.main === module) {
  try {
    const result = runReleaseConfigSmoke();
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  runReleaseConfigSmoke,
};
