// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Tests for scripts/privacy-scan.mjs. Fixtures are created in the operating system temp directory,
// outside the repository, and removed afterwards. Run with:  node --test scripts/

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HISTORY_MARK, hashToken, loadAllowlist, scanHistoryText, scanText, scanTree } from './privacy-scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'privacy-scan.mjs');
const allow = loadAllowlist();
const made = [];

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'privacy-fixture-'));
  made.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

const rules = (result) => result.findings.map((f) => f.rule);
const scan = (text, file = 'x.md') => scanText(text, file, allow, new Set()).map((f) => f.rule);

describe('working tree scan', () => {
  it('flags a Meta ad account id in a fixture and exits 1 from the CLI', () => {
    const dir = fixture({ 'notes.md': 'Account: act_1234567890\n' });
    const result = scanTree(dir, allow);
    assert.deepEqual(rules(result), ['meta-account-id']);
    assert.equal(result.findings[0].file, 'notes.md');
    assert.equal(result.findings[0].line, 1);
    let code = 0;
    try { execFileSync(process.execPath, [SCRIPT, '--root', dir], { stdio: 'pipe' }); } catch (e) { code = e.status; }
    assert.equal(code, 1);
  });

  it('never prints the full match', () => {
    const dir = fixture({ 'a.md': 'id act_1234567890 end\n' });
    let out = '';
    try { execFileSync(process.execPath, [SCRIPT, '--root', dir], { stdio: 'pipe' }); } catch (e) { out = String(e.stdout); }
    assert.match(out, /meta-account-id/);
    assert.doesNotMatch(out, /1234567890/);
  });

  it('passes and exits 0 on a clean fixture', () => {
    const dir = fixture({ 'README.md': '# Demo\nDEMO DATA, synthetic only. See https://example.com and meta-demo-account.\n', 'src/a.ts': 'export const x = 1;\n' });
    assert.deepEqual(scanTree(dir, allow).findings, []);
    const out = execFileSync(process.execPath, [SCRIPT, '--root', dir], { encoding: 'utf8' });
    assert.match(out, /passed/);
  });

  it('finds problems in nested files, and in file names', () => {
    const dir = fixture({ 'deep/er/file.txt': 'contact: someone@' + 'gmail.com\n' });
    assert.deepEqual(rules(scanTree(dir, allow)), ['email']);
  });

  it('skips node_modules, dist and binary files', () => {
    const dir = fixture({ 'node_modules/p/i.js': 'act_1234567890\n', 'dist/i.js': 'act_1234567890\n' });
    writeFileSync(join(dir, 'pic.png'), Buffer.from([0, 1, 2, 3]));
    const result = scanTree(dir, allow);
    assert.deepEqual(result.findings, []);
    assert.ok(result.skipped.some((s) => s.startsWith('pic.png')));
  });
});

describe('rules', () => {
  it('emails: real-looking flagged, example domains allowed, scoped npm names ignored', () => {
    assert.deepEqual(scan('mail me at jane.doe@' + 'corp.si'), ['email']);
    assert.deepEqual(scan('jane@example.com'), []);
    assert.deepEqual(scan('12345+bot@users.noreply.github.com'), []);
    assert.deepEqual(scan('import x from "@sedem-ads/analytics-core"'), []);
  });

  it('phone numbers in international and national form', () => {
    assert.deepEqual(scan('call +386 40 123 456'), ['phone']);
    assert.deepEqual(scan('call 041 123 456'), ['phone']);
    assert.deepEqual(scan('rate 12.5% on 2025-01-01 total 1,234.50'), []);
  });

  it('platform id shapes', () => {
    assert.deepEqual(scan('act_' + '9876543210'), ['meta-account-id']);
    assert.deepEqual(scan('page 123456789012345678'), ['platform-numeric-id']);
    assert.deepEqual(scan('customer 123-456-7890'), ['google-customer-id']);
    assert.deepEqual(scan('meta-demo-account and google-demo-account'), []);
    assert.deepEqual(scan('timestamp 1700000000000'), []);
  });

  it('secret shapes', () => {
    assert.deepEqual(scan('k = sk_' + 'live_' + 'A'.repeat(24)), ['secret-stripe-key']);
    assert.deepEqual(scan('EAA' + 'B'.repeat(40)), ['secret-meta-token']);
    assert.deepEqual(scan('AKIA' + 'Q'.repeat(16)), ['secret-aws-key']);
    assert.deepEqual(scan('ghp_' + 'z'.repeat(36)), ['secret-github-token']);
    assert.deepEqual(scan('-----BEGIN ' + 'RSA PRIVATE KEY-----'), ['secret-private-key']);
    assert.deepEqual(scan('const apiKey = "' + 'abcd1234'.repeat(3) + '";'), ['secret-assignment']);
    assert.deepEqual(scan('const apiKey = process.env.KEY;'), []);
    assert.deepEqual(scan('META_WRITE_ACCESS_TOKEN=your-token-here'), []);
  });

  it('hosts: unknown flagged, allowlisted ones and subdomains pass', () => {
    assert.deepEqual(scan('see https://portal.some-company.si/ads'), ['hostname']);
    assert.deepEqual(scan('visit app.mycompany.com'), ['hostname']);
    assert.deepEqual(scan('https://github.com/x/y and docs.github.com'), []);
    assert.deepEqual(scan('http://localhost:3000'), []);
    assert.deepEqual(scan('open README.md and index.js and Next.js'), []);
  });

  it('server paths, local paths and deployment fingerprints', () => {
    assert.deepEqual(scan('cd /home/' + 'someuser/app'), ['server-path']);
    assert.deepEqual(scan('C:\\' + 'Users\\someone\\x'), ['local-path']);
    assert.deepEqual(scan('BUILD_' + 'ID: abc'), ['deploy-fingerprint']);
    assert.deepEqual(scan('ssh deploy@' + 'host.example.com'), ['remote-login']);
  });
});

describe('hashed blocklist', () => {
  it('matches a single token, a phrase and a joined form without storing the name', () => {
    const hashes = new Set([hashToken('Acme Legal')]);
    const hit = (t) => scanText(t, 'x.md', allow, hashes).map((f) => f.rule);
    assert.deepEqual(hit('built for acmelegal'), ['blocklist']);
    assert.deepEqual(hit('built for Acme Legal d.o.o.'), ['blocklist']);
    assert.deepEqual(hit('ACME-LEGAL'), ['blocklist']);
    assert.deepEqual(hit('acme and legal separately in other words'), []);
  });

  it('ignores case and diacritics', () => {
    assert.equal(hashToken('Čaša'), hashToken('casa'));
  });

  it('the output shows a hash prefix, not the word', () => {
    const f = scanText('Acme Legal', 'x.md', allow, new Set([hashToken('acmelegal')]))[0];
    assert.match(f.match, /^\[hash [0-9a-f]{8}\]$/);
  });

  it('the shipped allowlist contains hashes only, no readable blocklist words', () => {
    assert.ok(allow.blocklistHashes.size >= 10);
    for (const h of allow.blocklistHashes) assert.match(h, /^[0-9a-f]{64}$/);
  });
});

describe('allowlist', () => {
  it('a per-file, per-rule exception silences only that rule in that file', () => {
    const custom = { ...allow, findings: [{ file: 'docs/a.md', rule: 'meta-account-id' }] };
    assert.deepEqual(scanText('act_1234567890', 'docs/a.md', custom, new Set()), []);
    assert.equal(scanText('act_1234567890', 'docs/b.md', custom, new Set()).length, 1);
    assert.equal(scanText('x@' + 'corp.si', 'docs/a.md', custom, new Set()).length, 1);
  });
});

describe('git history parsing (no git is run here)', () => {
  const commit = (hash, meta, body) => `${HISTORY_MARK}${hash}\u0002${meta.join('\u0002')}\n${body}`;

  it('flags an added line with file and line number, and a personal author email', () => {
    const patch = [
      'diff --git a/docs/a.md b/docs/a.md',
      '--- a/docs/a.md',
      '+++ b/docs/a.md',
      '@@ -1,0 +10,2 @@',
      '+fine line',
      '+account act_1234567890',
    ].join('\n');
    const out = commit('abcdef1234567890', ['A', 'person@' + 'gmail.com', 'A', 'noreply@example.com', 'subject'], patch);
    const result = scanHistoryText(out, allow);
    assert.equal(result.commits, 1);
    const by = Object.fromEntries(result.findings.map((f) => [f.rule, f]));
    assert.equal(by['meta-account-id'].file, 'abcdef12:docs/a.md');
    assert.equal(by['meta-account-id'].line, 11);
    assert.equal(by.email.file, 'commit:abcdef12');
  });

  it('a secret removed again in a later commit is still found in the earlier one', () => {
    const add = commit('1111111111', ['A', 'a@example.com', 'A', 'a@example.com', 's'], ['+++ b/x.env', '@@ -0,0 +1 @@', '+KEY=sk_' + 'live_' + 'Z'.repeat(24)].join('\n'));
    const del = commit('2222222222', ['A', 'a@example.com', 'A', 'a@example.com', 's'], ['+++ b/x.env', '@@ -1 +0,0 @@', '-KEY=sk_' + 'live_' + 'Z'.repeat(24)].join('\n'));
    const result = scanHistoryText(add + del, allow);
    assert.equal(result.commits, 2);
    assert.deepEqual(result.findings.map((f) => f.file), ['11111111:x.env']);
  });

  it('removed lines and context lines do not create findings, and clean history passes', () => {
    const out = commit('3333333333', ['A', 'a@example.com', 'A', 'a@example.com', 'chore: tidy'], ['+++ b/a.md', '@@ -1 +1 @@', '-act_1234567890', '+clean'].join('\n'));
    assert.deepEqual(scanHistoryText(out, allow).findings, []);
  });

  it('commit messages are scanned too', () => {
    const out = commit('4444444444', ['A', 'a@example.com', 'A', 'a@example.com', 'deploy to ' + 'portal.some-company.si'], '');
    assert.deepEqual(scanHistoryText(out, allow).findings.map((f) => f.rule), ['hostname']);
  });
});

describe('CLI', () => {
  it('exits 2 for an unknown option or a missing root', () => {
    for (const args of [['--nope'], ['--root', join(tmpdir(), 'does-not-exist-privacy')]]) {
      let code = 0;
      try { execFileSync(process.execPath, [SCRIPT, ...args], { stdio: 'pipe' }); } catch (e) { code = e.status; }
      assert.equal(code, 2, args.join(' '));
    }
  });

  it('--hash prints a stable sha256', () => {
    const out = execFileSync(process.execPath, [SCRIPT, '--hash', 'Hello World'], { encoding: 'utf8' }).trim();
    assert.equal(out, hashToken('helloworld'));
    assert.equal(resolve(SCRIPT).endsWith('privacy-scan.mjs'), true);
  });
});
