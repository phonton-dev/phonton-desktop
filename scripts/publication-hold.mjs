import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const requirements = [
  'windows-authenticode',
  'macos-developer-id-and-notarization',
  'signed-binary-provenance',
  'installed-platform-and-update-acceptance',
];

// This is deliberately a publication hold, not a native-signature verifier.
// Replacing it requires a reviewed implementation of every release requirement;
// neither an environment switch nor a policy edit to "ready" unlocks publication.
export function assertCandidateOnly(policy, context) {
  assert.deepEqual(policy, { schema: 1, publicRelease: 'blocked', requirements },
    'Unsupported release policy. The publication hold cannot be cleared with a policy toggle.');
  assert.equal(context.actions, 'true', 'Release policy requires GitHub Actions.');
  assert.equal(context.repository, 'phonton-dev/phonton-desktop', 'Unexpected release repository.');
  assert.match(context.sha ?? '', /^[0-9a-f]{40}$/, 'Release source must be an exact commit.');
  assert.match(context.runId ?? '', /^[1-9][0-9]*$/, 'Missing workflow run identity.');
  assert.match(context.ref ?? '', /^refs\/(heads|tags)\/[^\s]+$/, 'Unexpected source ref.');
  assert.equal(context.eventName, 'workflow_dispatch',
    'Public release is blocked pending trusted Windows/macOS signing, signed-byte provenance, '
    + 'and installed platform/update acceptance. Use workflow_dispatch for a candidate only. '
    + 'Updater signatures do not establish OS publisher trust.');
  return { candidateOnly: true, publicRelease: 'blocked', source: context.sha };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const policy = JSON.parse(readFileSync(new URL('../release-policy.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify(assertCandidateOnly(policy, {
    actions: process.env.GITHUB_ACTIONS,
    repository: process.env.GITHUB_REPOSITORY,
    sha: process.env.GITHUB_SHA,
    ref: process.env.GITHUB_REF,
    runId: process.env.GITHUB_RUN_ID,
    eventName: process.env.GITHUB_EVENT_NAME,
  })));
}
