// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Privacy scan for the public showcase repository.
//
//   node scripts/privacy-scan.mjs                 scan the working tree
//   node scripts/privacy-scan.mjs --git-history   scan every commit (added lines, messages, author emails, ref names)
//   node scripts/privacy-scan.mjs --root <dir>    scan another directory (used by the tests)
//   node scripts/privacy-scan.mjs --hash <word>   print the blocklist hash of a word, to add to the allowlist file
//
// What it looks for: email addresses, phone numbers, platform account/customer id shapes, API
// key and token shapes, host names, server paths, deployment fingerprints, and a blocklist of
// names. The blocklist is stored as SHA-256 hashes of lowercase ASCII tokens, so this file and
// the allowlist can be published without publishing the names they protect. Optional plain-text
// extras can come from the PRIVACY_BLOCKLIST environment variable (comma separated) or from a
// git-ignored scripts/privacy-blocklist.local.json (an array of strings).
//
// Output never prints a full match; findings are redacted so that CI logs do not leak what they find.
// Exit codes: 0 clean, 1 findings, 2 usage or environment error.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ALLOWLIST = join(HERE, 'privacy-allowlist.json');
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.pdf', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.zip', '.gz', '.tgz', '.mp4', '.webm', '.mov']);

// ---------------------------------------------------------------------------------------------
// rules

/** Each rule: id, regex (global), optional `accept(match, allow)` returning true when the match is fine. */
export const RULES = [
  {
    id: 'email',
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    accept: (m, allow) => {
      const domain = m.slice(m.lastIndexOf('@') + 1).toLowerCase();
      return allow.emailDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
    },
  },
  { id: 'phone', re: /(?<![\w.])\+\d{1,3}[ .-]?\(?\d{1,4}\)?(?:[ .-]?\d{2,4}){2,4}(?!\d)/g },
  { id: 'phone', re: /(?<![\w.])0\d{2}[ -]\d{3}[ -]\d{3}(?!\d)/g },
  { id: 'meta-account-id', re: /\bact_\d{6,}\b/g },
  { id: 'platform-numeric-id', re: /(?<![\w.-])\d{15,}(?![\w.-])/g },
  { id: 'google-customer-id', re: /(?<![\d-])\d{3}-\d{3}-\d{4}(?![\d-])/g },
  { id: 'secret-meta-token', re: /\bEAA[A-Za-z0-9]{30,}/g },
  { id: 'secret-stripe-key', re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { id: 'secret-stripe-webhook', re: /\bwhsec_[A-Za-z0-9]{16,}/g },
  { id: 'secret-aws-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: 'secret-github-token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/g },
  { id: 'secret-slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { id: 'secret-google-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'secret-anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { id: 'secret-openai-key', re: /\bsk-[A-Za-z0-9]{32,}\b/g },
  { id: 'secret-private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: 'secret-jwt', re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g },
  { id: 'secret-assignment', re: /\b(?:secret|token|passw(?:or)?d|api[_-]?key|private[_-]?key)[A-Za-z0-9_]*\s*[:=]\s*["'][A-Za-z0-9+/_=.-]{20,}["']/gi },
  { id: 'server-path', re: /(?:\/home\/[a-z_][\w-]*\/|\/var\/www\/|\/srv\/[\w-]+|\/etc\/(?:nginx|apache2?|httpd)\/|public_html\b|~\/\.ssh\b)/g },
  { id: 'local-path', re: /(?:[A-Za-z]:\\+(?:Users|dev)\\+[\w.-]+|\/Users\/[\w.-]+\/)/g },
  { id: 'deploy-fingerprint', re: /\b(?:BUILD_ID|X-Ads-Build|app-before-[\w.-]+|prisma migrate deploy)\b/gi },
  { id: 'remote-login', re: /\b(?:ssh|scp|rsync)\s+(?:-\S+\s+)*[\w.-]+@[\w.-]+/g },
  {
    id: 'hostname',
    re: /\bhttps?:\/\/([A-Za-z0-9.-]+)|(?<![\w@/.-])((?:[A-Za-z0-9-]+\.)+(?:si|com|net|org|io|eu|app|dev|cloud|info|biz))\b/g,
    host: true,
  },
];

// ---------------------------------------------------------------------------------------------
// allowlist and blocklist

export function loadAllowlist(path = DEFAULT_ALLOWLIST) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return {
    emailDomains: (raw.emailDomains ?? []).map((s) => s.toLowerCase()),
    hosts: (raw.hosts ?? []).map((s) => s.toLowerCase()),
    ignoredPaths: raw.ignoredPaths ?? [],
    findings: raw.findings ?? [],
    blocklistHashes: new Set((raw.blocklistHashes ?? []).map((s) => s.toLowerCase())),
  };
}

export function hashToken(word) {
  return createHash('sha256').update(normalizeToken(word)).digest('hex');
}

function normalizeToken(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extraBlocklistHashes(root) {
  const out = new Set();
  const add = (w) => { const n = normalizeToken(String(w)); if (n.length >= 3) out.add(hashToken(n)); };
  for (const w of (process.env.PRIVACY_BLOCKLIST ?? '').split(',')) add(w);
  for (const dir of [HERE, join(root, 'scripts')]) {
    const local = join(dir, 'privacy-blocklist.local.json');
    if (existsSync(local)) {
      try { for (const w of JSON.parse(readFileSync(local, 'utf8'))) add(w); } catch { /* ignore a malformed local file */ }
    }
  }
  return out;
}

/** Hashes of every 1-, 2- and 3-token window of a line, joined without separators. */
function* tokenWindows(line) {
  const tokens = line.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    let joined = '';
    for (let n = 0; n < 3 && i + n < tokens.length; n++) {
      joined += tokens[i + n];
      if (joined.length >= 3) yield joined;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// scanning

function redact(m) {
  const s = String(m);
  return s.length <= 4 ? '****' : `${s.slice(0, 2)}${'*'.repeat(Math.min(8, s.length - 3))}${s.slice(-1)}`;
}

function hostAllowed(host, allow) {
  const h = host.toLowerCase().replace(/\.$/, '');
  return allow.hosts.some((a) => h === a || h.endsWith(`.${a}`));
}

function isAllowlistedFinding(file, rule, allow) {
  return allow.findings.some((f) => (f.rule === rule || f.rule === '*') && (f.file === file || (f.fileSuffix && file.endsWith(f.fileSuffix))));
}

/**
 * Scan one text. Returns findings with line numbers and redacted matches.
 * `file` is a repository-relative path with forward slashes.
 */
export function scanText(text, file, allow, blockHashes) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 5000) continue; // minified or generated; not human-authored text
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      for (const match of line.matchAll(rule.re)) {
        const value = match[0];
        if (rule.accept?.(value, allow)) continue;
        if (rule.host) {
          const host = match[1] ?? match[2];
          if (hostAllowed(host, allow)) continue;
        }
        if (isAllowlistedFinding(file, rule.id, allow)) continue;
        findings.push({ file, line: i + 1, rule: rule.id, match: redact(value) });
      }
    }
    for (const w of tokenWindows(line)) {
      if (blockHashes.has(hashToken(w)) && !isAllowlistedFinding(file, 'blocklist', allow)) {
        findings.push({ file, line: i + 1, rule: 'blocklist', match: `[hash ${hashToken(w).slice(0, 8)}]` });
      }
    }
  }
  return findings;
}

function ignored(rel, allow) {
  return allow.ignoredPaths.some((p) => rel === p || rel.startsWith(p.endsWith('/') ? p : `${p}/`));
}

function* walk(dir, root, allow) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(root, full).split(sep).join('/');
    // Dependency and build directories are git-ignored at any depth, so skip them at any depth too.
    if (name === '.git' || name === 'node_modules' || name === 'dist' || name === 'coverage' || ignored(rel, allow)) continue;
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full, root, allow);
    else yield { full, rel, size: st.size };
  }
}

function isBinary(buf, rel) {
  const dot = rel.lastIndexOf('.');
  if (dot >= 0 && BINARY_EXT.has(rel.slice(dot).toLowerCase())) return true;
  return buf.subarray(0, 8000).includes(0);
}

export function scanTree(root, allow, extraHashes = new Set()) {
  const blockHashes = new Set([...allow.blocklistHashes, ...extraHashes]);
  const findings = [];
  const skipped = [];
  let files = 0;
  for (const f of walk(root, root, allow)) {
    findings.push(...scanText(f.rel, `path:${f.rel}`, allow, blockHashes)); // file names are published too
    if (f.size > MAX_FILE_BYTES) { skipped.push(`${f.rel} (larger than 2 MB)`); continue; }
    const buf = readFileSync(f.full);
    if (isBinary(buf, f.rel)) { skipped.push(`${f.rel} (binary)`); continue; }
    files++;
    findings.push(...scanText(buf.toString('utf8'), f.rel, allow, blockHashes));
  }
  return { files, skipped, findings };
}

/**
 * Parse `git log -p` output produced with the exact format string used in `scanHistory`.
 * Exported so that the parser can be tested without running git.
 */
export const HISTORY_MARK = '\u0001COMMIT\u0001';

export function scanHistoryText(output, allow, extraHashes = new Set()) {
  const blockHashes = new Set([...allow.blocklistHashes, ...extraHashes]);
  const findings = [];
  let commits = 0;
  for (const chunk of output.split(HISTORY_MARK).slice(1)) {
    commits++;
    const nl = chunk.indexOf('\n');
    const header = chunk.slice(0, nl).split('\u0002'); // hash, author name, author email, committer name, committer email, subject
    const rest = chunk.slice(nl + 1);
    const hash = (header[0] ?? '').slice(0, 8);
    const meta = header.slice(1).join(' ');
    for (const f of scanText(meta, `commit:${hash}`, allow, blockHashes)) findings.push({ ...f, line: 0 });
    let file = '(unknown)';
    let lineNo = 0;
    for (const line of rest.split('\n')) {
      if (line.startsWith('+++ ')) { file = line.slice(4).replace(/^b\//, ''); continue; }
      if (line.startsWith('@@')) { const m = /\+(\d+)/.exec(line); lineNo = m ? Number(m[1]) - 1 : 0; continue; }
      if (line.startsWith('+') && !line.startsWith('+++')) {
        lineNo++;
        if (ignored(file, allow)) continue;
        for (const f of scanText(line.slice(1), file, allow, blockHashes)) findings.push({ ...f, file: `${hash}:${file}`, line: lineNo });
      } else if (!line.startsWith('-')) lineNo++;
    }
  }
  return { commits, findings };
}

export function scanHistory(root, allow, extraHashes = new Set()) {
  const git = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const format = `${HISTORY_MARK}%H%x02%an%x02%ae%x02%cn%x02%ce%x02%s%n%b`;
  const out = git(['log', '--all', '--no-color', '--no-ext-diff', '--unified=0', '-p', `--format=${format}`]);
  const result = scanHistoryText(out, allow, extraHashes);
  const refs = git(['for-each-ref', '--format=%(refname)']);
  const blockHashes = new Set([...allow.blocklistHashes, ...extraHashes]);
  for (const f of scanText(refs, 'refs', allow, blockHashes)) result.findings.push(f);
  return result;
}

// ---------------------------------------------------------------------------------------------
// CLI

function main(argv) {
  const args = [...argv];
  const take = (flag) => { const i = args.indexOf(flag); if (i < 0) return undefined; return args.splice(i, 2)[1]; };
  const has = (flag) => { const i = args.indexOf(flag); if (i < 0) return false; args.splice(i, 1); return true; };

  const hashWord = take('--hash');
  if (hashWord !== undefined) { console.log(hashToken(hashWord)); return 0; }

  const rootArg = take('--root');
  const allowArg = take('--allowlist');
  const history = has('--git-history');
  const json = has('--json');
  if (args.length) { console.error(`Unknown arguments: ${args.join(' ')}`); return 2; }

  const root = resolve(rootArg ?? join(HERE, '..'));
  if (!existsSync(root)) { console.error(`Root does not exist: ${root}`); return 2; }
  let allow;
  try { allow = loadAllowlist(allowArg ? resolve(allowArg) : DEFAULT_ALLOWLIST); } catch (e) { console.error(`Cannot read allowlist: ${e.message}`); return 2; }
  const extra = extraBlocklistHashes(root);

  let result;
  try { result = history ? scanHistory(root, allow, extra) : scanTree(root, allow, extra); }
  catch (e) { console.error(`Scan failed: ${e.message.split('\n')[0]}`); return 2; }

  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    for (const f of result.findings) console.log(`${f.file}:${f.line}  ${f.rule}  ${f.match}`);
    const what = history ? `${result.commits} commits` : `${result.files} files`;
    if (!history && result.skipped.length) console.log(`(skipped ${result.skipped.length} binary or oversized files)`);
    console.log(result.findings.length ? `Privacy scan FAILED: ${result.findings.length} finding(s) in ${what}.` : `Privacy scan passed: ${what}, no findings.`);
  }
  return result.findings.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
