# GoBag+ site

Static site for <https://gobag.gredami.com>, served from GitHub Pages.

## Pages and languages

Home, pricing, FAQ and the guides — an index and six articles — in seven
languages. Each language is its
own URL, with the copy already in the HTML — no runtime translation. That is
what lets Google index and rank all seven separately; before, all seven shared
one URL and only English was ever indexed.

```
/            /pricing/        /faq/          /guides/      /guides/<slug>/      en
/fr/         /fr/pricing/     /fr/faq/       /fr/guides/   /fr/guides/<slug>/   … and de es it pt ru
```

You edit, by hand, in English:

- `index.html` — the **shell** every page is cut from (head, styles, bar,
  footer, scripts) *and* the home page's own content.
- `_pages/pricing.html`, `_pages/faq.html` — only the `<main>` of each other
  page. The build drops it into the shell in place of the home page's, so a
  style, the bar or a script exists once and reaches every page. The
  underscore keeps these sources off the published site.

Everything else — `pricing/`, `faq/`, `guides/` and the six language directories — is
generated and overwritten on every build. Never edit it.

Links between pages are written in English form (`/pricing/`, `/#features`,
`/`) and the build rewrites them per language (`/fr/pricing/`). In the bar,
Features is an anchor on the home page and becomes `/#features`
elsewhere; the key for the page being shown is lit and gets
`aria-current="page"`.

## Changing copy

1. Edit the English text in `index.html` or `_pages/*.html`.
2. Edit the matching key in `i18n/translations.json` — for the other six, and
   for English too: the English block feeds the titles and the structured
   data, so the build fails if it says something different from the page.
   Elements are paired to keys by their `data-i18n` / `data-i18n-html`
   attribute; `data-i18n-html` values may contain markup, `data-i18n` may not.
   A bare `&` in a `data-i18n-html` value ships straight into the page, so
   write `&amp;`.
3. Titles, meta descriptions and keywords live under each language's `seo`
   block in the same file — `title`/`description` for the home page,
   `pricingTitle`/`pricingDescription` and `faqTitle`/`faqDescription` for the
   others. Keep titles under ~60 characters and descriptions between 120 and
   160 so Google does not truncate them.
4. Run the build and commit everything it touched.

Attributes are translated too, through `data-i18n-attr`:

```html
<button aria-label="Next" data-i18n-attr="aria-label:nav_next">
<img alt="…" data-i18n-attr="alt:hero_img_alt">
```

It takes `attribute:key` pairs separated by spaces, and an element may carry
`data-i18n` and `data-i18n-attr` at once. The attribute has to already exist on
the element — the build refuses rather than inventing one, so a typo cannot
silently ship an element with no accessible name. **The value written in
`index.html` is the English**, exactly as element content is; the build only
rewrites the other six. Proper nouns are left alone on purpose: the footer's
`aria-label="Instagram"` carries no `data-i18n-attr`.

```sh
npm run build
```

The build also rewrites the `<!-- i18n:head -->` and `<!-- i18n:switcher -->`
regions of `index.html` itself, so English can never drift out of sync with the
rest. It regenerates `sitemap.xml` too, with every page in every language.

The FAQ page's structured data (`FAQPage`) is built from the questions in
`_pages/faq.html`, in their order — add a question there, with its
`faq_qN`/`faq_aN` strings, and it is in the markup too. Answers are plain text:
the accordion's reveal rebuilds an answer from its text, so a link belongs
outside the answer, as the "in detail" link under the plans group is.

## Guides

The articles people find the site through from search: a go bag checklist,
how much water and food to store, which documents to copy, and so on. They
are long-form, so unlike the rest of the site they are **not** translated a
key per paragraph. Each language has the whole article in its own file:

```
_guides/_layout.html          the <main> every guide is set in (English, data-i18n)
_guides/<lang>/<slug>.html    one article, written whole in that language
```

That is what lets each language be written for its readers rather than
translated from the American page: the German guides cite the BBK's ten days
and 2 litres, the French ones the government's *Tous responsables* kit, the
Russian ones the MChS.

A guide file is in two parts, split at its `guide:body` comment: above it
the `<h1>` and the `.page-head-lead` that go in the band at the top, below it
the article. Every `<h2>` carries an `id` — the rail's table of contents is
built from them, and the build fails on one without. Links to other pages are
written in English form (`/guides/<slug>/`, `/pricing/`) and rewritten per
language; a link to a page that does not exist fails the build. Plain `<ul>`
lists get bullets, `<ul class="checklist">` gets boxes to tick (and prints
that way), and `.guide-note.is-app` is the "In GoBag+" box. Anything the
article says the app does has to match what the FAQ says — expiry alerts and
the widget are Premium.

The band's "Updated" date, `Article` structured data and the sitemap's
`lastmod` come from git: the date the file was first committed and last
changed (today while it is uncommitted).

Titles and meta descriptions are `seo.<id>Title` / `seo.<id>Description` in
`i18n/translations.json`, as for any page; `guide_<id>_title` and
`guide_<id>_desc` are the card in the guides index and under every other
guide. To add a guide, add `{ id, slug }` to `GUIDES` in
`tools/build-i18n.mjs`, write `_guides/<lang>/<slug>.html` for all seven
languages, add those four strings to every language, and build. The slug is
the same in every language, as `/fr/pricing/` is.

## Adding a page

1. Write its `<main>` as `_pages/<id>.html`, opening on a `.page-head` band
   like the other two.
2. Add `{ id, path, key, crumb }` to `PAGES` in `tools/build-i18n.mjs`, and a
   key in the bar (and the drawer) whose `href` is the page's path.
3. Add `<id>Title` and `<id>Description` to every language's `seo` block, and
   the page's strings to every `strings` block, then build.

## Fonts

Self-hosted in `fonts/`, not linked from Google. A `<link>` to
fonts.googleapis.com hands the visitor's IP to Google before the consent banner
has been answered — the same leak the analytics gate closes, and the one
LG München I ruled on (3 O 17493/20). Self-hosting also drops two DNS + TLS
round trips before first paint.

```sh
node tools/fetch-fonts.mjs   # re-download woff2 + regenerate fonts/fonts.css
npm run build                # inline it into all 22 pages
```

`fonts/fonts.css` is generated — edit `FAMILIES` in `tools/fetch-fonts.mjs`
instead. Only latin, latin-ext, cyrillic and cyrillic-ext are fetched, and each
face keeps its `unicode-range`, so a German visitor never downloads Cyrillic.

The display face is **Alumni Sans**, not Big Shoulders Display: Big Shoulders
ships no Cyrillic subset, so the Russian headline silently fell back to Inter
and looked nothing like the other six. Alumni Sans is the condensed face that
keeps weight 900 *and* covers Cyrillic.

## Adding a language

Add it to `LANGS`, `LANG_CODES` and `LANG_LABELS` in `tools/build-i18n.mjs`,
add a full block (`seo` + all 156 strings) to `i18n/translations.json`, then
build. The build fails loudly on any missing string rather than shipping a
half-translated page.
