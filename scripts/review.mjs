// pnpm review <PR>: for Ivan's PC. Checks out a pull request, installs and starts the dev server.
// Usage: pnpm review 12
import { execSync } from 'node:child_process';

const pr = process.argv[2];
if (!pr || !/^\d+$/.test(pr)) {
  console.error('Usage: pnpm review <PR number>');
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
if (dirty) {
  console.error(`You have uncommitted changes. Commit or stash them first:\n${dirty}`);
  process.exit(1);
}

const branch = `review/pr-${pr}`;
run(`git fetch origin pull/${pr}/head:${branch} --force`);
run(`git checkout ${branch}`);
run('pnpm i');
console.log(`\nPR #${pr} is checked out on ${branch}. Open http://localhost:5173\n`);
run('pnpm dev');
