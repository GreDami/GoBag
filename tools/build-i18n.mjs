/**
 * Generates every page of the site in every language.
 *
 *   index.html            the shell every page is cut from — head, styles,
 *                         bar, footer, scripts — AND the English home page (/)
 *   _pages/<id>.html      the <main> of each other page, in English
 *   _guides/_layout.html  the <main> every guide is set in, in English
 *   _guides/<lang>/*.html each guide, written whole in its own language
 *   pricing/ faq/ guides/ generated English pages
 *   fr|de|es|it|pt|ru/    generated, overwritten on every run, each with its
 *                         own pricing/, faq/ and guides/
 *   sitemap.xml           regenerated with hreflang alternates
 *
 * Hand-edit index.html and _pages/*.html in English, and the matching strings
 * in i18n/translations.json for the other six, then re-run `npm run build`.
 * The guides are the exception: each language has its own file, see GUIDES.
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
/* ── pages ────────────────────────────────────────────────────────────────────

   The home page is index.html itself. Every other page is only its <main>,
   kept in _pages/ and dropped into the shell in place of the home page's — so
   the styles, the bar and the scripts exist once, and a fix to any of them
   reaches every page on the next build. The underscore keeps the sources off
   the published site: GitHub Pages leaves underscore folders out.

   `key` is the page's own key in the bar: on that page it is lit and marked
   as the current page. */
/* ── guides ───────────────────────────────────────────────────────────────────

   The articles people find the site through: "go bag checklist", "how much
   water to store". They are long-form, so they are not translated a key per
   paragraph like the rest of the site. Each language has the whole article in
   _guides/<lang>/<slug>.html, which lets a German guide cite the BBK's ten
   days and a French one the government's 72-hour kit instead of reading as
   the American page translated.

   A guide file is in two parts, split at its guide:body comment: above it the
   h1 and the lead that go in the band at the top, below it the article. Its
   h2s carry ids, and the rail's table of contents is built from them. Links
   are written in English form (/guides/…/, /pricing/) and rewritten per
   language like everywhere else.

   Its title and meta description are seo.<id>Title and seo.<id>Description,
   like any page's; guide_<id>_title and guide_<id>_desc are the short name and
   the line on its card, in the guides index and under every other guide. The
   slug is the same in every language, as /fr/pricing/ is. */
const GUIDES = [
  { id: 'checklist', slug: 'go-bag-checklist' },
  { id: 'kinds', slug: 'go-bag-vs-bug-out-bag' },
  { id: 'start', slug: 'prep-kit-for-beginners' },
  { id: 'storage', slug: 'emergency-water-and-food' },
  { id: 'documents', slug: 'emergency-documents' },
  { id: 'upkeep', slug: 'emergency-kit-maintenance' },
];

const PAGES = [
  { id: 'home', path: '' },
  { id: 'pricing', path: 'pricing/', key: '/pricing/', crumb: 'pricing_title' },
  { id: 'faq', path: 'faq/', key: '/faq/', crumb: 'faq_label' },
  { id: 'guides', path: 'guides/', key: '/guides/', crumb: 'guides_label' },
  ...GUIDES.map((g) => ({
    id: g.id, path: `guides/${g.slug}/`, key: '/guides/', crumb: `guide_${g.id}_title`, guide: g,
  })),
];
const HOME = PAGES[0];
const GUIDES_INDEX = PAGES.find((p) => p.id === 'guides');

const pathFor = (lang, page = HOME) => (lang === 'en' ? '/' : `/${lang}/`) + page.path;
const urlFor = (lang, page = HOME) => ORIGIN + pathFor(lang, page);

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

/* ── replace named attributes on every [data-i18n-attr] element ───────────────

   data-i18n-attr="aria-label:nav_next" rewrites that element's aria-label with
   the translated string; several pairs are separated by spaces. Content and
   attributes are independent, so an element may carry data-i18n and
   data-i18n-attr at once.

   This exists because everything a screen reader is handed used to be English
   in all seven builds — a Russian visitor tabbing the carousel heard "Previous"
   and "Next". The content pass above cannot reach it: an attribute is not an
   element's content, and the elements concerned are icon-only, so there is no
   content to translate in the first place.

   The tag-level regex below does NOT collide with the content pass: its
   `data-i18n(-html)?="` requires the attribute name to end right there, and
   data-i18n-attr continues with "-attr". */

const ATTR_SPEC = /<([a-zA-Z][\w-]*)\b((?:[^>"]|"[^"]*")*?\bdata-i18n-attr="([^"]+)"(?:[^>"]|"[^"]*")*?)>/g;

function translateAttrs(html, strings, lang) {
  let n = 0;
  const out = html.replace(ATTR_SPEC, (full, tag, attrs, spec) => {
    let next = attrs;
    for (const pair of spec.trim().split(/\s+/)) {
      const at = pair.indexOf(':');
      if (at < 1) throw new Error(`[${lang}] malformed data-i18n-attr "${pair}" on <${tag}>`);
      const name = pair.slice(0, at);
      const key = pair.slice(at + 1);
      const value = strings[key];
      if (value === undefined) throw new Error(`[${lang}] missing string: ${key}`);
      /* Anchored on preceding whitespace so translating "title" cannot land on
         a "data-title" sitting next to it. */
      const target = new RegExp(`(\\s)${name.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&')}="[^"]*"`);
      if (!target.test(next)) {
        throw new Error(`[${lang}] <${tag}> has no ${name}= to translate (key ${key})`);
      }
      next = next.replace(target, `$1${name}="${attr(value)}"`);
      n++;
    }
    return `<${tag}${next}>`;
  });
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

/* The home page's title and descriptions are the language's main ones. Every
   other page has its own pair beside them in the seo block — <id>Title and
   <id>Description — and a page without them fails the build rather than
   shipping the home page's title twice. */
function seoFor(lang, page) {
  const { seo } = tr[lang];
  if (page === HOME) return { title: seo.title, description: seo.description, og: seo.ogDescription };
  const title = seo[`${page.id}Title`];
  const description = seo[`${page.id}Description`];
  if (!title || !description) {
    throw new Error(`[${lang}] missing seo.${page.id}Title or seo.${page.id}Description`);
  }
  return { title, description, og: description };
}

function renderHead(lang, page) {
  const { seo, strings } = tr[lang];
  const self = urlFor(lang, page);
  const meta = seoFor(lang, page);

  const alternates = LANGS
    .map((l) => `    <link rel="alternate" hreflang="${l}" href="${urlFor(l, page)}">`)
    .join('\n');

  const ogAlternates = LANGS.filter((l) => l !== lang)
    .map((l) => `    <meta property="og:locale:alternate" content="${tr[l].seo.locale}">`)
    .join('\n');

  /* The FAQ page's questions, in the order it shows them — FAQ_NUMS is read
     off the page source, so a question added there is here too. */
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: lang,
    mainEntity: FAQ_NUMS.map((i) => ({
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
       ratings is also too thin a base to publish as an average. */
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

  /* A guide sits one level down, under the guides index. */
  const trail = page === HOME ? [] : [
    { name: 'GoBag+', item: urlFor(lang) },
    ...(page.guide ? [{ name: strings[GUIDES_INDEX.crumb], item: urlFor(lang, GUIDES_INDEX) }] : []),
    { name: strings[page.crumb], item: self },
  ];
  const crumbs = page === HOME ? null : {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, ...t })),
  };

  const dates = page.guide ? guideDates(page, lang) : null;
  const article = page.guide && {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title,
    description: meta.description,
    inLanguage: lang,
    url: self,
    mainEntityOfPage: self,
    image: `${ORIGIN}/screenshots/og.jpg`,
    datePublished: dates.published,
    dateModified: dates.modified,
    author: { '@type': 'Organization', name: 'GreDami', url: 'https://gredami.com' },
    publisher: {
      '@type': 'Organization',
      name: 'GreDami',
      url: 'https://gredami.com',
      logo: { '@type': 'ImageObject', url: `${ORIGIN}/img/logo-64.png` },
    },
  };

  const guideList = page === GUIDES_INDEX && {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: PAGES.filter((p) => p.guide).map((p, i) => ({
      '@type': 'ListItem', position: i + 1, url: urlFor(lang, p), name: strings[p.crumb],
    })),
  };

  /* The app and the site are described once, on the home page. The FAQ
     markup goes with the questions, on the FAQ page. */
  const blocks = page === HOME ? [app, site] : [crumbs];
  if (page.id === 'faq') blocks.push(faq);
  if (article) blocks.push(article);
  if (guideList) blocks.push(guideList);

  /* Root only: a visitor whose browser asks for one of the other six is offered
     that page. It used to call location.replace() and move them, which meant
     someone who chose an English result in Google could land on /fr/ instead —
     a bait-and-switch against the snippet they clicked, and a redirect Google
     sees on the canonical URL. Offering costs nothing and keeps the choice with
     the visitor; the dismissal is remembered, so it is asked once.

     Deferred to DOMContentLoaded because it appends an element. Anyone who has
     already used the switcher has a stored choice: picking English stores 'en',
     which is absent from OFFER, so they are never asked again. */
  const offer = lang !== 'en' || page !== HOME ? '' : `    <script>
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

  return `${offer}    <title>${esc(meta.title)}</title>
    <meta name="description" content="${attr(meta.description)}">
    <meta name="keywords" content="${attr(seo.keywords)}">
    <link rel="canonical" href="${self}">

    <!-- Every language is its own URL; hreflang tells Google which to show where. -->
${alternates}
    <link rel="alternate" hreflang="x-default" href="${urlFor('en', page)}">

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
    <meta property="og:title" content="${attr(meta.title)}">
    <meta property="og:description" content="${attr(meta.og)}">
    <meta property="og:type" content="${page.guide ? 'article' : 'website'}">
    <meta property="og:url" content="${self}">
    <meta property="og:site_name" content="GoBag+">
    <meta property="og:locale" content="${seo.locale}">
${ogAlternates}
    <meta property="og:image" content="${ORIGIN}/screenshots/og.jpg">
    <meta property="og:image:secure_url" content="${ORIGIN}/screenshots/og.jpg">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${attr(meta.title)}">

    <!-- Twitter / X -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${attr(meta.title)}">
    <meta name="twitter:description" content="${attr(meta.description)}">
    <meta name="twitter:image" content="${ORIGIN}/screenshots/og.jpg">
    <meta name="twitter:site" content="@GreDamiStudio">

    <!-- Structured data -->
${blocks.map((b) => `    <script type="application/ld+json">\n${jsonld(b)}\n    </script>`).join('\n')}
`;
}

/* ── language switcher ────────────────────────────────────────────────────── */

function renderSwitcher(lang, page) {
  /* Generated markup, so the label is translated here rather than through
     data-i18n-attr — the whole region is overwritten on every build. */
  const label = tr[lang].strings.nav_language;
  const options = LANGS.map((l) => {
    const active = l === lang;
    return `                <a class="lang-option${active ? ' active' : ''}" href="${pathFor(l, page)}"`
      + ` hreflang="${l}" onclick="rememberLang('${l}')"${active ? ' aria-current="page"' : ''}>`
      + `${LANG_LABELS[l]}</a>`;
  }).join('\n');

  return `        <div class="lang-switcher" id="langSwitcher">
            <button class="lang-trigger" onclick="toggleLangMenu(event)" aria-haspopup="true" aria-expanded="false" aria-label="${attr(label)}">
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
function extractRegion(html, name, style = 'css') {
  const wrap = style === 'css' ? (t) => `/* i18n:${name}:${t} */`
                               : (t) => `<!-- i18n:${name}:${t} -->`;
  const start = wrap('start');
  const end = wrap('end');
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`marker i18n:${name} not found in index.html`);
  return html.slice(a + start.length, b).replace(/^\n|\n$/g, '');
}

/* The shell's <main>, which every page but the home page swaps for its own. */
const MAIN_OPEN = '<main id="content">';
const MAIN_CLOSE = '</main>';

function withMain(html, body) {
  const a = html.indexOf(MAIN_OPEN);
  const b = html.indexOf(MAIN_CLOSE, a);
  if (a < 0 || b < 0) throw new Error('<main id="content"> not found in index.html');
  return html.slice(0, a + MAIN_OPEN.length) + '\n\n' + body.trim() + '\n\n' + html.slice(b);
}

/* The bar is written for the home page, where Features is a section of the
   page itself. Anywhere else it is a section of the home page, and the key for the page being shown is lit and says so to assistive
   tech — the scroll-driven highlight only ever touches keys that are anchors. */
function navFor(html, page) {
  if (page === HOME) return html;
  html = html.replace(/href="#features"/g, 'href="/#features"');
  const key = `class="nav-key" href="${page.key}"`;
  if (!html.includes(key)) throw new Error(`the bar has no key for ${page.key}`);
  /* A guide lights the Guides key too, but the key is the index, not the
     page being read, so it is the current section rather than the page. */
  const here = `/${page.path}` === page.key ? 'page' : 'true';
  return html.split(key).join(`class="nav-key current" href="${page.key}" aria-current="${here}"`);
}

/* Links between pages stay in the visitor's language: /pricing/ on a French
   page is /fr/pricing/, and the logo goes home to /fr/ rather than to the
   English page. Only the pages that exist in every language are rewritten —
   /privacy/ is English only, and nothing under /img/ or /fonts/ is a page.
   Runs before the head and the switcher are written, which carry their own
   correct links. Longest path first, so /guides/x/ is not cut at /guides/. */
const rx = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&');
const PAGE_PATHS = PAGES.filter((p) => p.path).map((p) => p.path)
  .sort((a, b) => b.length - a.length);
const LOCAL_LINK = new RegExp(`href=(["'])\\/((?:${PAGE_PATHS.map(rx).join('|')})?(?:#[^"']*)?)\\1`, 'g');

function localizeLinks(html, lang) {
  if (lang === 'en') return html;
  return html.replace(LOCAL_LINK, (m, q, rest) => `href=${q}/${lang}/${rest}${q}`);
}

/* English is not translated: index.html and _pages/ are the English pages as
   written. translations.json still carries an English block, because the
   titles and the structured data are built from it — so the two have to say
   the same thing. A string changed in only one of them fails the build here,
   rather than shipping a FAQ whose markup answers differently from its page. */
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const squash = (s) => s.replace(/\s+/g, ' ').trim();

function checkEnglish(html, where) {
  const open = /<([a-zA-Z][\w-]*)\b([^>]*?\bdata-i18n(-html)?="([^"]+)"[^>]*?)>/g;
  let m;
  let n = 0;
  while ((m = open.exec(html)) !== null) {
    const [full, tag, , isHtml, key] = m;
    const start = m.index + full.length;
    const shown = html.slice(start, findClose(html, tag, start));
    const want = tr.en.strings[key];
    if (want === undefined) throw new Error(`[en] ${where}: no English string for ${key}`);
    const got = isHtml ? squash(shown) : squash(decode(shown));
    if (got !== squash(want)) {
      throw new Error(`[en] ${where}: ${key} reads\n  "${got}"\non the page but\n  "${squash(want)}"\nin translations.json`);
    }
    n++;
  }
  return n;
}

/* ── dates ────────────────────────────────────────────────────────────────────

   lastmod is the date the source page was last committed, not the date of the
   build. Stamping today on every run tells Google the page changed when it did
   not, which teaches it to distrust the field — and it made every build dirty
   the sitemap for no reason.

   The uncommitted check is what keeps it honest. Reading the last commit date
   alone made the field permanently one commit stale: the build runs before the
   commit that carries its own output, so it stamped the date of the *previous*
   change every time. If the source is dirty, the page is changing in this very
   build and the commit about to carry it will be dated today. */
const TODAY = new Date().toISOString().slice(0, 10);
const SOURCES = 'index.html _pages i18n/translations.json';
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const gitMemo = new Map();

function git(cmd) {
  if (!gitMemo.has(cmd)) {
    let out = null;
    try { out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch (e) { /* not a git checkout */ }
    gitMemo.set(cmd, out);
  }
  return gitMemo.get(cmd);
}

/* When any of the given sources last changed: today if one is uncommitted. */
function changed(sources) {
  const dirty = git(`git status --porcelain -- ${sources}`);
  if (dirty === null || dirty) return TODAY;
  const d = git(`git log -1 --format=%cs -- ${sources}`);
  return ISO_DAY.test(d || '') ? d : TODAY;
}

/* When a file was first committed: a guide's publication date. */
function firstCommitted(file) {
  const d = (git(`git log --diff-filter=A --format=%cs -- "${file}"`) || '').split('\n').pop();
  return ISO_DAY.test(d) ? d : TODAY;
}

const latest = (...days) => days.sort().pop();
const siteChanged = changed(SOURCES);

const GUIDE_LAYOUT_FILE = '_guides/_layout.html';
const guideFile = (page, lang) => path.join('_guides', lang, `${page.guide.slug}.html`);

/* What the guide says it is dated: the article itself, not the shell around it. */
function guideDates(page, lang) {
  const file = guideFile(page, lang);
  return { published: firstCommitted(file), modified: changed(`"${file}"`) };
}

/* ── guide pages ──────────────────────────────────────────────────────────── */

const GUIDE_LAYOUT = fs.readFileSync(GUIDE_LAYOUT_FILE, 'utf8');
const slot = (name) => `<!-- guide:${name} -->`;

function fill(html, name, value, where) {
  const mark = slot(name);
  const at = html.indexOf(mark);
  if (at < 0 || html.indexOf(mark, at + 1) >= 0) throw new Error(`${where}: needs exactly one ${mark}`);
  return html.slice(0, at) + value + html.slice(at + mark.length);
}

/* The cards that lead to the guides: all of them in the index, the other five
   under each guide. Built here in the page's own language, so they carry no
   data-i18n for the translation pass to find. */
function guideCards(lang, except, heading) {
  const s = tr[lang].strings;
  const cards = PAGES.filter((p) => p.guide && p !== except).map((p) => {
    const title = s[`guide_${p.id}_title`];
    const desc = s[`guide_${p.id}_desc`];
    if (!title || !desc) throw new Error(`[${lang}] missing guide_${p.id}_title or guide_${p.id}_desc`);
    return `        <li><a class="guide-card" href="/${p.path}">
            <${heading}>${esc(title)}</${heading}>
            <p>${esc(desc)}</p>
            <span class="guide-card-go" aria-hidden="true">→</span>
        </a></li>`;
  });
  return `<ul class="guide-cards">\n${cards.join('\n')}\n    </ul>`;
}

function guideMain(page, lang) {
  const file = guideFile(page, lang);
  if (!fs.existsSync(file)) throw new Error(`[${lang}] missing ${file}`);
  const src = fs.readFileSync(file, 'utf8');
  if (/\bdata-i18n/.test(src)) {
    throw new Error(`${file}: a guide is written in its own language, so it takes no data-i18n`);
  }
  const mark = slot('body');
  const cut = src.indexOf(mark);
  if (cut < 0 || src.indexOf(mark, cut + 1) >= 0) throw new Error(`${file}: needs exactly one ${mark}`);
  const head = src.slice(0, cut).trim();
  const body = src.slice(cut + mark.length).trim();

  /* The rail's contents, read off the article's own h2s. */
  const sections = [...body.matchAll(/<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)];
  if (!sections.length || sections.length !== (body.match(/<h2\b/g) || []).length) {
    throw new Error(`${file}: every <h2> needs an id — the table of contents is built from them`);
  }
  const toc = `<ul class="faq-topics">\n${sections.map(([, id, text]) =>
    `                    <li><a href="#${id}">${text.replace(/<[^>]+>/g, '').trim()}</a></li>`).join('\n')}\n                </ul>`;

  const { modified } = guideDates(page, lang);
  const shown = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(`${modified}T00:00:00Z`));
  const updated = `<p class="guide-updated">${esc(tr[lang].strings.guide_updated)} `
    + `<time datetime="${modified}">${shown}</time></p>`;

  let html = fill(GUIDE_LAYOUT, 'head', `${head}\n            ${updated}`, GUIDE_LAYOUT_FILE);
  html = fill(html, 'toc', toc, GUIDE_LAYOUT_FILE);
  html = fill(html, 'body', body, GUIDE_LAYOUT_FILE);
  return fill(html, 'more', guideCards(lang, page, 'h3'), GUIDE_LAYOUT_FILE);
}

/* ── assembly, every page in every language ───────────────────────────────── */

const source = fs.readFileSync('index.html', 'utf8');
const bodies = Object.fromEntries(PAGES.filter((p) => p !== HOME && !p.guide)
  .map((p) => [p.id, fs.readFileSync(path.join('_pages', `${p.id}.html`), 'utf8')]));
/* The FAQ page's questions in the order it shows them, for its structured data. */
const FAQ_NUMS = [...bodies.faq.matchAll(/data-i18n="faq_q(\d+)"/g)].map((m) => Number(m[1]));

/* The <main> a page is set in, still in English apart from a guide's article. */
function mainFor(page, lang) {
  if (page.guide) return guideMain(page, lang);
  if (page === GUIDES_INDEX) return fill(bodies[page.id], 'cards', guideCards(lang, null, 'h2'), '_pages/guides.html');
  return bodies[page.id];
}

const report = Object.fromEntries(LANGS.map((l) => [l, []]));
const links = [];
let written = 0;

for (const page of PAGES) {
  const checked = checkEnglish(page === HOME ? source : mainFor(page, 'en'), page.id);
  report.en.push(`${page.id} ${checked} checked`);

  for (const lang of LANGS) {
    let html = navFor(page === HOME ? source : withMain(source, mainFor(page, lang)), page);

    if (lang !== 'en') {
      const r = translateBody(html, tr[lang].strings, lang);
      const a = translateAttrs(r.html, tr[lang].strings, lang);
      html = a.html;
      report[lang].push(`${page.id} ${r.count}+${a.count}`);
    }

    html = localizeLinks(html, lang);
    html = html.replace(/<html lang="[^"]*">/, `<html lang="${lang}">`);
    html = replaceRegion(html, 'head', renderHead(lang, page));
    html = replaceRegion(html, 'switcher', renderSwitcher(lang, page));
    html = replaceRegion(html, 'fonts', fontCss, 'css');

    /* English home is index.html itself, written back with its regions. */
    const out = path.join(lang === 'en' ? '.' : lang, page.path, 'index.html');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
    for (const [, href] of html.matchAll(/\bhref="(\/(?!\/)[^"#?]*)/g)) links.push([pathFor(lang, page), href]);
    written++;
  }
}

/* Every link to a page of this site has to land on one. The guides are
   forty-two hand-written files, and a link with a typo in it would otherwise
   ship as a 404 that nobody sees. */
const broken = links.filter(([, href]) => !fs.existsSync(
  path.join('.', decodeURI(href), href.endsWith('/') ? 'index.html' : '')));
if (broken.length) {
  throw new Error(`links to nothing:\n${[...new Set(broken.map(([from, to]) => `  ${from} → ${to}`))].join('\n')}`);
}

/* ── sitemap ──────────────────────────────────────────────────────────────── */

/* A guide changes with its article, and with the shell and layout around it. */
const lastmodFor = (page, lang) => (page.guide
  ? latest(siteChanged, changed(GUIDE_LAYOUT_FILE), changed(`"${guideFile(page, lang)}"`))
  : siteChanged);
const altFor = (page) => LANGS
  .map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${urlFor(l, page)}"/>`)
  .join('\n') + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${urlFor('en', page)}"/>`;

const entries = PAGES.flatMap((page) => LANGS.map((l) => `  <url>
    <loc>${urlFor(l, page)}</loc>
${altFor(page)}
    <lastmod>${lastmodFor(page, l)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${page === HOME ? '1.0' : '0.8'}</priority>
  </url>`)).join('\n');

fs.writeFileSync('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
  <url>
    <loc>${ORIGIN}/privacy/</loc>
    <lastmod>${siteChanged}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
`);

/* The privacy page is not generated, but it carries blocks that must be
   byte-identical to the main page: the @font-face rules, the cookie banner CSS,
   the consent gate itself, and the footer with its CSS. Copy them across on
   every build — a fix applied to one and not the other is exactly the drift
   this prevents (the footer had already lost two links and 8px off each icon
   by the time it joined this list). The footer goes across in English, the
   language the privacy page is written in. */
const priv = 'privacy/index.html';
let privHtml = fs.readFileSync(priv, 'utf8');
privHtml = replaceRegion(privHtml, 'fonts', fontCss, 'css');
for (const region of ['cookiecss', 'consentjs', 'footercss']) {
  privHtml = replaceRegion(privHtml, region, extractRegion(source, region), 'css');
}
privHtml = replaceRegion(privHtml, 'footer', extractRegion(source, 'footer', 'html'));
/* The copied CSS reads the main page's tokens, and the privacy page declares
   its own, shorter set. A token it lacks fails silently: the cookie banner's
   Accept button read var(--green-ink), had no fill there, and showed as white
   text on nothing. Fail the build instead. */
for (const region of ['cookiecss', 'footercss']) {
  for (const [, token] of extractRegion(source, region).matchAll(/var\((--[\w-]+)/g)) {
    if (!new RegExp(`^\\s*${token}\\s*:`, 'm').test(privHtml)) {
      throw new Error(`${priv}: the copied ${region} block uses ${token}, which the page never declares`);
    }
  }
}
fs.writeFileSync(priv, privHtml);

console.log(LANGS.map((l) => `${l}: ${report[l].join(' · ')}`).join('\n'));
console.log(`fonts: ${(fontCss.match(/@font-face/g) || []).length} faces inlined into ${written + 1} pages`);
console.log(`sitemap.xml: ${PAGES.length * LANGS.length + 1} URLs`);
