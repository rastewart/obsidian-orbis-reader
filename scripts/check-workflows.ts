// The GitHub Actions workflows, checked by the two tools that read them: actionlint and zizmor.
//
// Usage:
//   pnpm lint:workflows
//
// Both are installed separately — `brew install actionlint zizmor` — because neither is an npm package.
//
// **They check different things.** actionlint reads a workflow the way the runner will: an input an action does not
// take, an expression that will not evaluate, and shellcheck over every `run:` step. zizmor reads it for security: the
// token's permissions, credentials left on disk, and pinned actions.
//
// **zizmor's most useful checks need GitHub.** `impostor-commit` asks GitHub whether a pinned hash is really in the
// action's repository, and a hash that is not makes the job fail before it starts, with nothing in the diff to show
// why. Those checks need a token, so this passes one on — `GH_TOKEN` or `GITHUB_TOKEN` if set, otherwise
// `gh auth token` — and says so when there is none and they were skipped. **In CI there is always one**, so a missing
// token there fails rather than letting the gate quietly lose the check.
import { execFileSync, spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const WORKFLOWS = '.github/workflows';

function installed(tool: string): boolean {
  return spawnSync(tool, ['--version'], { stdio: 'ignore' }).status === 0;
}

/** A token for zizmor's online checks, or null when there is none to be had. */
function githubToken(): string | null {
  const fromEnv = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (fromEnv) return fromEnv;
  try {
    return (
      execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
    );
  } catch {
    return null;
  }
}

const missing = ['actionlint', 'zizmor'].filter((tool) => !installed(tool));
if (missing.length > 0) {
  console.error(`Not installed: ${missing.join(', ')}.

Install with \`brew install ${missing.join(' ')}\`, or see https://github.com/rhysd/actionlint and
https://docs.zizmor.sh/installation/.`);
  process.exit(1);
}

const token = githubToken();
if (!token && process.env.CI) {
  console.error('No GitHub token in CI. Set GH_TOKEN on this step so zizmor can run its online checks.');
  process.exit(1);
}

let failed = false;

const actionlint = spawnSync('actionlint', [], { cwd: ROOT, stdio: 'inherit' });
if (actionlint.status !== 0) failed = true;

const zizmor = spawnSync('zizmor', token ? [WORKFLOWS] : ['--offline', WORKFLOWS], {
  cwd: ROOT,
  stdio: 'inherit',
  env: token ? { ...process.env, GH_TOKEN: token } : process.env,
});
if (zizmor.status !== 0) failed = true;

if (failed) {
  console.error(`
Workflow problems above. actionlint and zizmor each explain their findings and link to the rule.`);
  process.exit(1);
}

console.log(
  token
    ? 'Workflows clean — actionlint and zizmor, including the checks that ask GitHub about each pinned action.'
    : 'Workflows clean — actionlint and zizmor offline. No GitHub token, so the checks that ask GitHub about each ' +
        'pinned action were skipped: sign in with `gh auth login`, or set GH_TOKEN.'
);
