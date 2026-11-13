/**
 * Tells Bing, Yandex, Seznam and the other IndexNow engines that the site's
 * pages changed, so new and updated guides are crawled in hours rather than
 * weeks. Brave and DuckDuckGo draw partly on Bing's index, so they benefit too.
 *
 * Run it after a push to main has been published by GitHub Pages:
 *
 *   npm run indexnow            every URL in sitemap.xml
 *   npm run indexnow -- --since 2026-11-13   only URLs whose lastmod is that day or later
 *
 * The key is the name of the <key>.txt file at the site root; IndexNow fetches
 * https://gobag.gredami.com/<key>.txt to check that the submission is ours.
 * Google does not take part in IndexNow: for it, the sitemap in Search Console
 * is the channel.
 */
import fs from 'fs';

const HOST = 'gobag.gredami.com';
const keyFile = fs.readdirSync('.').find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error('no IndexNow key file (<32 hex>.txt) at the site root');
const key = keyFile.slice(0, -4);
if (fs.readFileSync(keyFile, 'utf8').trim() !== key) throw new Error(`${keyFile} must contain exactly its own name`);

const at = process.argv.indexOf('--since');
const since = at > 0 ? process.argv[at + 1] : null;

const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
const urls = [...sitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>[\s\S]*?<lastmod>([^<]+)<\/lastmod>/g)]
  .filter(([, , lastmod]) => !since || lastmod >= since)
  .map(([, loc]) => loc);
if (!urls.length) {
  console.log('nothing to submit');
  process.exit(0);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList: urls }),
});
console.log(`IndexNow: ${urls.length} URLs → HTTP ${res.status} ${res.statusText}`);
if (res.status >= 400) {
  console.log(await res.text());
  process.exit(1);
}
