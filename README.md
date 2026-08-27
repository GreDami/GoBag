# GoBag+ site

Static site for <https://gobag.gredami.com>, served from GitHub Pages.

## Languages

Each language is its own URL, with the copy already in the HTML — no runtime
translation. That is what lets Google index and rank all seven separately;
before, all seven shared one URL and only English was ever indexed.

```
/          en   (also the source file: index.html)
/fr/  /de/  /es/  /it/  /pt/  /ru/
```

`index.html` is the **only page you edit by hand**. The six language
directories are generated and overwritten on every build — never edit them.

## Changing copy

1. Edit the English text in `index.html`.
2. Edit the matching key for the other six in `i18n/translations.json`.
   Elements are paired to keys by their `data-i18n` / `data-i18n-html`
   attribute; `data-i18n-html` values may contain markup, `data-i18n` may not.
3. Titles, meta descriptions and keywords live under each language's `seo`
   block in the same file. Keep titles under ~60 characters and descriptions
   between 120 and 160 so Google does not truncate them.
4. Run the build and commit everything it touched.

```sh
npm run build
```

The build also rewrites the `<!-- i18n:head -->` and `<!-- i18n:switcher -->`
regions of `index.html` itself, so English can never drift out of sync with the
rest. It regenerates `sitemap.xml` too.

## Fonts

Self-hosted in `fonts/`, not linked from Google. A `<link>` to
fonts.googleapis.com hands the visitor's IP to Google before the consent banner
has been answered — the same leak the analytics gate closes, and the one
LG München I ruled on (3 O 17493/20). Self-hosting also drops two DNS + TLS
round trips before first paint.

```sh
node tools/fetch-fonts.mjs   # re-download woff2 + regenerate fonts/fonts.css
npm run build                # inline it into all 8 pages
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
add a full block (`seo` + all 106 strings) to `i18n/translations.json`, then
build. The build fails loudly on any missing string rather than shipping a
half-translated page.
