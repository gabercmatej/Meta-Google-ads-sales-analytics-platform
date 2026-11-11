// Fails when the JavaScript loaded by index.html (entry + modulepreloads) exceeds the gzip budget.
// Lazy page chunks are not counted: they load only when their route opens.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 250;
const dist = resolve(import.meta.dirname, '../apps/demo/dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
let total = 0;
for (const f of new Set(files)) {
  const kb = gzipSync(readFileSync(join(dist, f))).length / 1024;
  total += kb;
  console.log(`${f.padEnd(48)} ${kb.toFixed(1)} kB gzip`);
}
console.log(`initial JS: ${total.toFixed(1)} kB gzip (budget ${BUDGET_KB} kB)`);
if (!files.length || total > BUDGET_KB) process.exit(1);
