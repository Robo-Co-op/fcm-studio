import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 実際のチェックの終了コードで判定する。Stop hook の代替ではなく手動ゲート。
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const temporary = mkdtempSync(join(tmpdir(), 'fcm-gate-'));
const report = join(temporary, 'vitest.json');

function check(args) {
  console.log(`Gate: npm ${args.join(' ')}`);
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: root, stdio: 'inherit', timeout: 600_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`npm ${args[0]} failed: ${result.error?.message || `exit ${result.status}`}`);
  }
}

try {
  if (!existsSync(npmCli)) throw new Error('npm CLI not found; run via npm run gate');
  check(['run', 'lint']);
  check(['test', '--', '--reporter=default', '--reporter=json', '--outputFile', report]);
  const results = JSON.parse(readFileSync(report, 'utf8'));
  const assertions = results.testResults?.flatMap((suite) => suite.assertionResults ?? []) ?? [];
  if (results.success !== true || assertions.length < 57 || assertions.some((test) => test.status !== 'passed')) {
    throw new Error('Tests must include at least the 57-test baseline, with no failed, skipped, pending, or todo assertions');
  }
  check(['run', 'build']);
  console.log(`Gate PASS: lint, ${assertions.length} passing tests, build. Deployment and independent review are separate requirements.`);
} catch (error) {
  console.error(`Gate BLOCK: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  rmSync(report, { force: true });
  rmdirSync(temporary);
}
