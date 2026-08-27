/**
 * Generates one static page per language from index.html.
 *
 *   index.html            English source AND the English page (/)
 *   fr|de|es|it|pt|ru/    generated, overwritten on every run
 *   sitemap.xml           regenerated with hreflang alternates
 *
 * index.html is the only file you hand-edit: change the English copy there and
 * the matching string in i18n/translations.json, then re-run `npm run build`.
 * Everything between the <!-- i18n:head --> and <!-- i18n:switcher --> markers
 * is machine-written — including in index.html itself, so English never drifts
 * out of sync with the other six.
 */
import fs from 'fs';
import path from 'path';

const ORIGIN = 'https://gobag.gredami.com';
const LANGS = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ru'];
const LANG_CODES = { en: 'EN', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', pt: 'PT', ru: 'RU' };
const LANG_LABELS = {
  en: 'English', fr: 'Français', de: 'Deutsch', es: 'Español',
  it: 'Italiano', pt: 'Português', ru: 'Русский',
};

const tr = JSON.parse(fs.readFileSync('i18n/translations.json', 'utf8'));
/* Self-hosted @font-face rules, inlined into every page so no request leaves
   the origin and none of them costs a round trip. Refresh with
   `node tools/fetch-fonts.mjs`, then rebuild. */
const fontCss = fs.readFileSync('fonts/fonts.css', 'utf8').trimEnd();
const urlFor = (lang) => (lang === 'en' ? `${ORIGIN}/` : `${ORIGIN}/${lang}/`);
const pathFor = (lang) => (lang === 'en' ? '/' : `/${lang}/`);

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => esc(s).replace(/"/g, '&quot;');
/* A literal </script> inside JSON-LD would close the block early. */
const jsonld = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');

/* ── replace the content of every [data-i18n] element ─────────────────────── */

const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr']);

function translateBody(html, strings, lang) {
  const open = /<([a-zA-Z][\w-]*)\b([^>]*?\bdata-i18n(-html)?="([^"]+)"[^>]*?)>/g;
  let out = '';
  let cursor = 0;
  let m;
  let n = 0;

  while ((m = open.exec(html)) !== null) {
    const [full, tag, , isHtml, key] = m;
    if (VOID.has(tag.toLowerCase())) {
      throw new Error(`data-i18n on void element <${tag}> (key ${key})`);
    }
    const value = strings[key];
    if (value === undefined) throw new Error(`[${lang}] missing string: ${key}`);

    const contentStart = m.index + full.length;
    const contentEnd = findClose(html, tag, contentStart);
    if (contentEnd < 0) throw new Error(`unbalanced <${tag}> for key ${key}`);

    out += html.slice(cursor, contentStart) + (isHtml ? value : esc(value));
    cursor = contentEnd;
    open.lastIndex = contentEnd;
    n++;
  }
  out += html.slice(cursor);
  return { html: out, count: n };
}

/* Index of the closing tag that balances an element opened just before `from`. */
function findClose(html, tag, from) {
  const scan = new RegExp(`<(/?)${tag}\\b([^>]*)>`, 'gi');
  scan.lastIndex = from;
  let depth = 0;
  let m;
  while ((m = scan.exec(html)) !== null) {
    if (m[1] === '/') {
      if (depth === 0) return m.index;
      depth--;
    } else if (!m[2].endsWith('/')) {
      depth++;
    }
  }
  return -1;
}

/* ── head ─────────────────────────────────────────────────────────────────── */

function renderHead(lang) {
  const { seo, strings } = tr[lang];
  const self = urlFor(lang);

  const alternates = LANGS
    .map((l) => `    <link rel="alternate" hreflang="${l}" href="${urlFor(l)}">`)
    .join('\n');

  const ogAlternates = LANGS.filter((l) => l !== lang)
    .map((l) => `    <meta property="og:locale:alternate" content="${tr[l].seo.locale}">`)
    .join('\n');

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: lang,
    mainEntity: [1, 2, 3, 4, 5, 6].map((i) => ({
      '@type': 'Question',
      name: strings[`faq_q${i}`],
      acceptedAnswer: { '@type': 'Answer', text: strings[`faq_a${i}`] },
    })),
  };

  const app = {
    '@context': 'https://schema.org',
    '@type': 'MobileApplication',
    name: 'GoBag+',
    alternateName: ['GoBag', 'Go Bag', 'GoBag Plus'],
    operatingSystem: 'iOS',
    applicationCategory: 'UtilitiesApplication',
    url: self,
    inLanguage: lang,
    downloadUrl: 'https://apps.apple.com/app/id6760232332',
    installUrl: 'https://apps.apple.com/app/id6760232332',
    image: `${ORIGIN}/screenshots/og.jpg`,
    screenshot: `${ORIGIN}/screenshots/1.jpg`,
    description: seo.ogDescription,
    keywords: seo.keywords,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '5.0', ratingCount: '3' },
    author: { '@type': 'Organization', name: 'GreDami', url: 'https://gredami.com' },
    sameAs: [
      'https://apps.apple.com/app/id6760232332',
      'https://www.instagram.com/getemergencyready/',
      'https://www.youtube.com/channel/UC-hk7FsblFeTFA8LYsb7U-g',
      'https://www.tiktok.com/@emergency_ready',
      'https://x.com/GreDamiStudio',
    ],
  };

  const site = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'GoBag+',
    alternateName: ['GoBag', 'Go Bag', 'prep kit app'],
    url: self,
    inLanguage: lang,
    publisher: { '@type': 'Organization', name: 'GreDami', url: 'https://gredami.com' },
  };

  /* Root only: a first-time visitor with no stored choice is sent to their own
     language. Language pages never redirect, so this cannot loop, and Googlebot
     (Accept-Language: en) stays on the English root and indexes it.

     Emitted at the very top of <head> so the decision is made before the rest
     of the head is parsed. It does not save the font request: Chrome's preload
     scanner reads the whole head buffer before any inline script runs, so a
     redirected visitor always opens — and then aborts — one request to
     fonts.googleapis.com. Only a server-side redirect could avoid that, and
     GitHub Pages has none. The aborted request is harmless. */
  const redirect = lang !== 'en' ? '' : `    <script>
    (function() {
      var p = location.pathname;
      if (p !== '/' && p !== '/index.html') return;
      var supported = ${JSON.stringify(LANGS.filter((l) => l !== 'en'))};
      var pick;
      try { pick = localStorage.getItem('gobag_lang'); } catch (e) {}
      if (!pick) pick = (navigator.language || '').slice(0, 2).toLowerCase();
      if (supported.indexOf(pick) !== -1) location.replace('/' + pick + '/');
    })();
    </script>
`;

  return `${redirect}    <title>${esc(seo.title)}</title>
    <meta name="description" content="${attr(seo.description)}">
    <meta name="keywords" content="${attr(seo.keywords)}">
    <link rel="canonical" href="${self}">

    <!-- Every language is its own URL; hreflang tells Google which to show where. -->
${alternates}
    <link rel="alternate" hreflang="x-default" href="${urlFor('en')}">

    <meta name="theme-color" content="#f6f1e6">
    <meta name="robots" content="index, follow">
    <meta name="author" content="GreDami">

    <!-- Open Graph -->
    <meta property="og:title" content="${attr(seo.title)}">
    <meta property="og:description" content="${attr(seo.ogDescription)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${self}">
    <meta property="og:site_name" content="GoBag+">
    <meta property="og:locale" content="${seo.locale}">
${ogAlternates}
    <meta property="og:image" content="${ORIGIN}/screenshots/og.jpg">
    <meta property="og:image:secure_url" content="${ORIGIN}/screenshots/og.jpg">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${attr(seo.title)}">

    <!-- Twitter / X -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${attr(seo.title)}">
    <meta name="twitter:description" content="${attr(seo.description)}">
    <meta name="twitter:image" content="${ORIGIN}/screenshots/og.jpg">
    <meta name="twitter:site" content="@GreDamiStudio">

    <!-- Structured data -->
    <script type="application/ld+json">
${jsonld(app)}
    </script>
    <script type="application/ld+json">
${jsonld(site)}
    </script>
    <script type="application/ld+json">
${jsonld(faq)}
    </script>
`;
}

/* ── language switcher ────────────────────────────────────────────────────── */

function renderSwitcher(lang) {
  const options = LANGS.map((l) => {
    const active = l === lang;
    return `                <a class="lang-option${active ? ' active' : ''}" href="${pathFor(l)}"`
      + ` hreflang="${l}" onclick="rememberLang('${l}')"${active ? ' aria-current="page"' : ''}>`
      + `${LANG_LABELS[l]}</a>`;
  }).join('\n');

  return `        <div class="lang-switcher" id="langSwitcher">
            <button class="lang-trigger" onclick="toggleLangMenu(event)" aria-haspopup="true" aria-expanded="false" aria-label="Language">
                <span id="currentLangCode">${LANG_CODES[lang]}</span>
                <span class="arrow" aria-hidden="true">▼</span>
            </button>
            <div class="lang-dropdown">
${options}
            </div>
        </div>`;
}

/* ── assembly ─────────────────────────────────────────────────────────────── */

/* Regions are delimited by comments in whatever syntax is legal where they sit:
   HTML comments in markup, CSS comments inside <style>. */
function replaceRegion(html, name, body, style = 'html') {
  const wrap = style === 'css' ? (t) => `/* i18n:${name}:${t} */`
                               : (t) => `<!-- i18n:${name}:${t} -->`;
  const start = wrap('start');
  const end = wrap('end');
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`marker i18n:${name} not found`);
  return html.slice(0, a + start.length) + '\n' + body + '\n' + html.slice(b);
}

const source = fs.readFileSync('index.html', 'utf8');
const report = [];

for (const lang of LANGS) {
  let html = source;

  if (lang !== 'en') {
    const r = translateBody(html, tr[lang].strings, lang);
    html = r.html;
    report.push(`${lang}: ${r.count} elements`);
  } else {
    report.push('en: source (not translated)');
  }

  html = html.replace(/<html lang="[^"]*">/, `<html lang="${lang}">`);
  html = replaceRegion(html, 'head', renderHead(lang));
  html = replaceRegion(html, 'switcher', renderSwitcher(lang));
  html = replaceRegion(html, 'fonts', fontCss, 'css');

  if (lang === 'en') {
    fs.writeFileSync('index.html', html);
  } else {
    fs.mkdirSync(lang, { recursive: true });
    fs.writeFileSync(path.join(lang, 'index.html'), html);
  }
}

/* ── sitemap ──────────────────────────────────────────────────────────────── */

const today = new Date().toISOString().slice(0, 10);
const alt = LANGS
  .map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${urlFor(l)}"/>`)
  .join('\n') + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${urlFor('en')}"/>`;

const entries = LANGS.map((l) => `  <url>
    <loc>${urlFor(l)}</loc>
${alt}
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>`).join('\n');

fs.writeFileSync('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
  <url>
    <loc>${ORIGIN}/privacy/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
`);

/* Standalone page: not generated, but it carries the same @font-face block. */
const priv = 'privacy/index.html';
fs.writeFileSync(priv, replaceRegion(fs.readFileSync(priv, 'utf8'), 'fonts', fontCss, 'css'));

console.log(report.join('\n'));
console.log(`fonts: ${(fontCss.match(/@font-face/g) || []).length} faces inlined into ${LANGS.length + 1} pages`);
console.log(`sitemap.xml: ${LANGS.length + 1} URLs`);
