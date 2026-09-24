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
import { execSync } from 'child_process';

const ORIGIN = 'https://gobag.gredami.com';
const LANGS = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ru'];
const LANG_CODES = { en: 'EN', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', pt: 'PT', ru: 'RU' };
const LANG_LABELS = {
  en: 'English', fr: 'Français', de: 'Deutsch', es: 'Español',
  it: 'Italiano', pt: 'Português', ru: 'Русский',
};

/* Chrome, not page copy — the same reason LANG_LABELS lives here rather than in
   translations.json. Shown on the root page only, in the visitor's own
   language, offering the translation instead of forcing it on them. */
const LANG_OFFER = {
  fr: 'Voir cette page en français',
  de: 'Diese Seite auf Deutsch ansehen',
  es: 'Ver esta página en español',
  it: 'Vedi questa pagina in italiano',
  pt: 'Ver esta página em português',
  ru: 'Открыть эту страницу на русском',
};
const LANG_DISMISS = {
  fr: 'Fermer', de: 'Schließen', es: 'Cerrar',
  it: 'Chiudi', pt: 'Fechar', ru: 'Закрыть',
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
    /* No aggregateRating. It was a hand-written 5.0 from 3 ratings, which meant
       a figure that had to be re-typed here every time the App Store moved, and
       Google requires the markup to match what the page visibly says. Three
       ratings is also too thin a base to publish as an average. The two verbatim
       reviews stay; only the aggregate claim is gone. */
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

  /* Root only: a visitor whose browser asks for one of the other six is offered
     that page. It used to call location.replace() and move them, which meant
     someone who chose an English result in Google could land on /fr/ instead —
     a bait-and-switch against the snippet they clicked, and a redirect Google
     sees on the canonical URL. Offering costs nothing and keeps the choice with
     the visitor; the dismissal is remembered, so it is asked once.

     Deferred to DOMContentLoaded because it appends an element. Anyone who has
     already used the switcher has a stored choice: picking English stores 'en',
     which is absent from OFFER, so they are never asked again. */
  const offer = lang !== 'en' ? '' : `    <script>
    (function () {
      var p = location.pathname;
      if (p !== '/' && p !== '/index.html') return;
      var OFFER = ${JSON.stringify(LANG_OFFER)};
      var DISMISS = ${JSON.stringify(LANG_DISMISS)};
      var read = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
      var write = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
      if (read('gobag_lang_offer') === 'dismissed') return;
      var pick = read('gobag_lang') || (navigator.language || '').slice(0, 2).toLowerCase();
      var text = OFFER[pick];
      if (!text) return;

      var build = function () {
        var box = document.createElement('div');
        box.className = 'lang-offer';
        var a = document.createElement('a');
        a.href = '/' + pick + '/';
        a.setAttribute('hreflang', pick);
        a.textContent = text;
        a.addEventListener('click', function () { write('gobag_lang', pick); });
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'lang-offer-close';
        x.setAttribute('aria-label', DISMISS[pick] || 'Close');
        x.textContent = '\\u00d7';
        x.addEventListener('click', function () {
          write('gobag_lang_offer', 'dismissed');
          box.remove();
        });
        box.appendChild(a);
        box.appendChild(x);
        document.body.appendChild(box);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
      else build();
    })();
    </script>
`;

  return `${offer}    <title>${esc(seo.title)}</title>
    <meta name="description" content="${attr(seo.description)}">
    <meta name="keywords" content="${attr(seo.keywords)}">
    <link rel="canonical" href="${self}">

    <!-- Every language is its own URL; hreflang tells Google which to show where. -->
${alternates}
    <link rel="alternate" hreflang="x-default" href="${urlFor('en')}">

    <meta name="theme-color" content="#f6f1e6">
    <meta name="robots" content="index, follow">
    <meta name="author" content="GreDami">

    <!-- The hero headline is the LCP element and it is set in Alumni Sans 900.
         The @font-face rules are inlined below, but the browser only fetches a
         face once it has matched an element to it, which is a layout pass too
         late: the headline paints in Inter and swaps. Preloading the one subset
         this page can actually use removes that swap. Only the two faces above
         the fold are listed — preloading more would compete with the hero
         image for the same early bandwidth. The crossorigin attribute is
         required even same-origin, or the fetch is made twice. No backticks in
         this comment: it lives inside a JS template literal. -->
    <link rel="preload" as="font" type="font/woff2" crossorigin
          href="/fonts/alumni-sans-700-900-${lang === 'ru' ? 'cyrillic' : 'latin'}.woff2">
    <link rel="preload" as="font" type="font/woff2" crossorigin
          href="/fonts/inter-300-900-${lang === 'ru' ? 'cyrillic' : 'latin'}.woff2">

    <!-- Safari on iOS turns this into a native App Store banner above the page,
         with the real localised price and an Open/View button. It is the one
         install path that needs no tap into a new tab. -->
    <meta name="apple-itunes-app" content="app-id=6760232332">

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

/* Body of a marked region, without the markers. */
function extractRegion(html, name) {
  const start = `/* i18n:${name}:start */`;
  const end = `/* i18n:${name}:end */`;
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`marker i18n:${name} not found in index.html`);
  return html.slice(a + start.length, b).replace(/^\n|\n$/g, '');
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

/* lastmod is the date the source page was last committed, not the date of the
   build. Stamping today on every run tells Google the page changed when it did
   not, which teaches it to distrust the field — and it made every build dirty
   the sitemap for no reason.

   The uncommitted check is what keeps it honest. Reading the last commit date
   alone made the field permanently one commit stale: the build runs before the
   commit that carries its own output, so it stamped the date of the *previous*
   change every time. If the source is dirty, the page is changing in this very
   build and the commit about to carry it will be dated today. */
const SOURCES = 'index.html i18n/translations.json';

function lastModified() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (execSync(`git status --porcelain -- ${SOURCES}`, { encoding: 'utf8' }).trim()) {
      return today;
    }
    const d = execSync(`git log -1 --format=%cs -- ${SOURCES}`, { encoding: 'utf8' }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  } catch (e) { /* not a git checkout */ }
  return today;
}
const today = lastModified();
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

/* The privacy page is not generated, but it carries three blocks that must be
   byte-identical to the main page: the @font-face rules, the cookie banner CSS
   and the consent gate itself. Copy them across on every build — a fix applied
   to one and not the other is exactly the drift this prevents. */
const priv = 'privacy/index.html';
let privHtml = fs.readFileSync(priv, 'utf8');
privHtml = replaceRegion(privHtml, 'fonts', fontCss, 'css');
for (const region of ['cookiecss', 'consentjs']) {
  privHtml = replaceRegion(privHtml, region, extractRegion(source, region), 'css');
}
fs.writeFileSync(priv, privHtml);

console.log(report.join('\n'));
console.log(`fonts: ${(fontCss.match(/@font-face/g) || []).length} faces inlined into ${LANGS.length + 1} pages`);
console.log(`sitemap.xml: ${LANGS.length + 1} URLs`);
