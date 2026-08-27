/**
 * Downloads the woff2 files the site uses into fonts/ and writes the matching
 * @font-face CSS to fonts/fonts.css.
 *
 * Self-hosted rather than linked from fonts.googleapis.com: that link hands the
 * visitor's IP to Google before the consent banner has been answered, which is
 * the same leak the analytics gate closes, and it is what LG München I ruled on
 * (3 O 17493/20). It also drops two DNS + TLS round trips before first paint.
 *
 * Only the subsets the seven languages need are fetched. The unicode-range on
 * each face is preserved verbatim, so a visitor still downloads only the script
 * they are actually reading — a German visitor never pulls the Cyrillic file.
 *
 * Re-run after changing a family or a weight:  node tools/fetch-fonts.mjs
 */
import fs from 'fs';
import path from 'path';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SUBSETS = new Set(['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext']);

const FAMILIES = [
  // Inter and Alumni Sans are variable fonts: one file covers every weight.
  { query: 'Inter:wght@300..900',       note: 'body text, 300-900' },
  { query: 'Alumni+Sans:wght@700..900', note: 'display headings, 700 and 900' },
  // IBM Plex Mono has no variable version on Google Fonts; 500 and 600 are used.
  { query: 'IBM+Plex+Mono:wght@500;600', note: 'mono labels, 500 and 600' },
];

const OUT = 'fonts';
fs.mkdirSync(OUT, { recursive: true });

const fetchText = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  return r.text();
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let css = `/* Self-hosted from Google Fonts by tools/fetch-fonts.mjs — do not edit.
   Nothing here reaches a third-party server: the files sit in /fonts/. */\n`;
let total = 0;
const kept = [];

for (const { query, note } of FAMILIES) {
  const src = await fetchText(`https://fonts.googleapis.com/css2?family=${query}&display=swap`);
  const blocks = src.split(/\/\*\s*([\w-]+)\s*\*\//).slice(1);
  let files = 0, bytes = 0, family = '';

  for (let i = 0; i < blocks.length; i += 2) {
    const subset = blocks[i];
    const face = blocks[i + 1];
    if (!SUBSETS.has(subset)) continue;

    family = face.match(/font-family:\s*'([^']+)'/)[1];
    const weight = face.match(/font-weight:\s*([^;]+);/)[1].trim();
    const range = face.match(/unicode-range:\s*([^;]+);/)[1].trim();
    const url = face.match(/url\((https:\/\/[^)]+\.woff2)\)/)[1];

    const name = `${slug(family)}-${slug(weight)}-${subset}.woff2`;
    const buf = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
    fs.writeFileSync(path.join(OUT, name), buf);
    files++; bytes += buf.length;

    css += `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(/fonts/${name}) format('woff2');
  unicode-range: ${range};
}\n`;
  }

  total += bytes;
  kept.push(`${family.padEnd(16)} ${String(files).padStart(2)} files  ${(bytes / 1024).toFixed(1).padStart(6)} KB  — ${note}`);
}

fs.writeFileSync(path.join(OUT, 'fonts.css'), css);
console.log(kept.join('\n'));
console.log(`${''.padEnd(16)} ${''.padStart(2)}         ${(total / 1024).toFixed(1).padStart(6)} KB total`);
