# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Jekyll static site for **Pacific Article** (article.pacificsec.com), the blog/research arm of PacificSec, a cybersecurity company. It's built on the "Jekyll Origin" premium theme. Content is almost entirely security research write-ups (red team, pentesting, AD, cloud/AWS, CI/CD security, bug bounty).

## Commands

```bash
bundle install                  # install gems (first-time setup / after Gemfile changes)
bundle exec jekyll serve        # run local dev server (http://localhost:4000)
bundle exec jekyll build        # production build -> _site/
```

There is no JS package.json/build step, no test suite, and no linter run via CLI — `.stylelintrc.json` and `.prettierrc` are enforced through the VS Code extensions listed in `.vscode/extensions.json` (format-on-save), not a script.

Deployment is via Netlify (`netlify.toml`): build command `jekyll build`, publish dir `_site`, `JEKYLL_ENV=production`.

## Architecture

**Content lives in `collections/_posts/`**, not the Jekyll-conventional `_posts/`. The `posts` collection is configured in `_config.yml` (`collections_dir: collections`, output permalink `/blog/:path/`). Filenames follow `YYYY-MM-DD-slug.md`. `collections/_examples/` holds a heavily-commented (Portuguese) template post (`2024-12-20-working-with-jekyll.md`) demonstrating every front-matter field — use it as the reference when adding a post rather than copying an existing article verbatim.

**Post front matter contract** (see any file in `collections/_posts/`):
- `layout: post`, `title`, `date` ("YYYY-MM-DD" string)
- `authors`: array of keys that **must** already exist in `_data/authors.yml`
- `categories`: array of names that **must** already exist as files in `categories/` (each category file is just `layout: category` + `title`, and doubles as the category's index page — creating a new category means adding a new `.md` file there)
- `thumbnail` / `image`: paths under `assets/images/posts/<author>/...` (or an external URL)
- `meta_title` / `meta_description` / `meta_image`: SEO/OpenGraph overrides, fall back to the main fields via `_includes/framework/seo-meta-tags.html` / `og-meta-tags.html` if blank

Global front-matter defaults for the `posts` collection, `categories/`, and `pages/` are set centrally in `_config.yml` under `defaults:` (e.g. all posts default to `layout: post`, all files in `categories/` get permalink `/category/:basename/`, all files in `pages/` get permalink `/:basename/`). Prefer editing those scopes over repeating layout/permalink in every file.

**Site chrome vs. content separation:**
- `_layouts/` — page skeletons (`post.html`, `blog.html`, `category.html`, `home.html`, etc.), plus numbered variants (`post-2.html`, `post-3.html`, `blog-2.html`, `blog-3.html`) which are alternate/experimental designs — check which one a page's front matter actually references before assuming `post.html`/`blog.html` are in use.
- `_includes/framework/` — the theme's reusable components (header, footer, cards, paginator, comments, analytics snippets, contact forms, etc.). This is theme machinery; treat it as mostly stable, low-churn code.
- `_includes/framework/shortcodes/` — Liquid tags used inline in post markdown body content: `figure.html`, `image.html`, `link-preview.html`, `youtube.html`. Post bodies embed images via `{% include framework/shortcodes/figure.html src="..." title="..." alt="..." %}`, not raw markdown `![]()`.
- `_includes/theme/cards/` — post/project card partials used on listing pages.
- `_data/` — site-wide structured content: `authors.yml` (author profiles/socials, keyed by the slug used in post `authors:`), `menu.yml` (nav menus: `main`, `footer_primary`, `bottom`), `contact.yml`, `partners.json`, `social.json`.
- `_sass/theme/` vs `_sass/framework/` — same split as `_includes`: `theme/_custom.scss` and `theme/_variables.scss` are where site-specific overrides belong; `framework/` (Bootstrap + zerostatic library) is the vendored theme core.
- `pages/` — standalone pages (about, contact, terms, privacy, success) with permalinks derived from filename via the `_config.yml` default scope.
- `categories/` — one file per category, also the category landing page content.
- `blog/` — listing pages (`index.html`, `articles.html`, `news.html`) that render the `posts` collection, generally via pagination (`jekyll-paginate`, configured `paginate: 6`, `paginate_path: /blog/page/:num`).

**Theming/config is centralized in `_config.yml`**: colors (light/dark mode pairs, suffixed `_dark`), fonts, logo, header/footer toggles, analytics IDs (GA, GTM, Plausible, Umami), comments (Disqus/Commento), newsletter (Mailchimp), and contact form backend (Netlify Forms vs Formspree) are all theme-level flags here rather than hardcoded in templates — check here first before hunting through includes for "how do I turn X on/off."

## Conventions

- New blog posts are the most common change in this repo — add the `.md` file to `collections/_posts/`, add any new author to `_data/authors.yml`, ensure every listed category already has a file in `categories/`, and drop images under `assets/images/posts/<author-name>/`.
- `_site/` and `.jekyll-cache/` are build output — never hand-edit, they're regenerated by `jekyll build`/`serve`.
