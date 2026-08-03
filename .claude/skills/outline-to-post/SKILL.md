---
name: outline-to-post
description: Convert an article exported from Outline/tikiwiki (tikiwiki.pacificsec.com) into a Jekyll post for this repo (collections/_posts/), following the site's front matter and body conventions. Use whenever the user attaches or pastes a Markdown article draft and asks to add/publish/turn it into a post.
---

# Outline → Jekyll post

Turns a Markdown export from our self-hosted Outline (tikiwiki.pacificsec.com) into a post file this Jekyll site accepts, in `collections/_posts/`. See the repo's `CLAUDE.md` for the general post front-matter contract — this skill covers the finer conventions that only show up by reading actual posts.

## Hard rule

**Never alter the article's wording, order, or meaning.** Only adapt *structure* (front matter, shortcode syntax, whitespace) so Jekyll accepts it. If something in the source looks broken, wrong, or ambiguous (garbled characters, missing image, unclear author), do not silently fix or guess — leave it as-is (or make the minimal structural adaptation needed for the build to work) and call it out as an observation in your final summary instead.

## Steps

1. **Read 2-3 recent posts** in `collections/_posts/` before touching anything — conventions here are inferred from real posts, not fully documented, and may have drifted since this skill was written. Also check `collections/_examples/2024-12-20-working-with-jekyll.md` (the annotated template), `_data/authors.yml`, and `ls categories/`.

2. **Determine the author.** Match against `_data/authors.yml` using clues in the article (GitHub links to PoC repos, bylines, writing style/topic match with an author's `bio`/`job`). If no confident match, ask the user or leave a placeholder and flag it explicitly — don't guess silently.

3. **Determine categories.** Prefer existing files in `categories/`. Only create a new one (`layout: category` + `title`, kebab-case filename, matches the `title` via the site's `/category/:basename/` permalink default) when the article's topic genuinely isn't covered — e.g. this skill previously added `categories/supply-chain-security.md` for a supply-chain-attack-themed post. Mention any new category file you create.

4. **Build front matter**, matching the pattern actually used by existing posts (not just the annotated example, which is older/looser):
   ```yaml
   ---
   layout: post
   title: "<verbatim article title>"
   date: "YYYY-MM-DD"
   authors: ["<author_key>"]
   categories: ["Existing Or New", "..."]
   description:
   thumbnail: "/assets/images/posts/<author-folder>/<n>/<file>"
   image: "/assets/images/posts/<author-folder>/<n>/<file>"
   comments: false

   meta_title: "<same as title>"
   meta_description:
   meta_image: "/assets/images/posts/<author-folder>/<n>/<file>"
   ---
   ```
   - `description` / `meta_description` are conventionally left **blank** (all current posts do this — it falls back via `_includes/framework/seo-meta-tags.html`). Re-check current posts in case this has changed.
   - If the source article has no images at all (text/code/links only), leave `thumbnail`/`image`/`meta_image` blank (no quotes, just the bare key) rather than an empty string — Liquid treats `""` as truthy, which can render a broken `src=""`. Flag that the user needs to add a thumbnail before publishing.
   - `date`: if the article doesn't state a publish date, use today's date as a placeholder, but explicitly flag it in your summary as a placeholder the user must set to the real date — the filename must be renamed to match if it changes, since Jekyll posts require `YYYY-MM-DD-slug.md`.

5. **Filename**: `YYYY-MM-DD-slug.md` in `collections/_posts/`, slug in kebab-case derived from the title (or the source doc's own slug, minus any Outline document-ID suffix).

6. **Convert the body:**
   - Drop a duplicate H1 title at the very top of the source body (the front matter `title` covers it) — none of the existing posts repeat the title as an H1 in-body.
   - `##` headers, `>` blockquotes (used here for TL;DR/callout boxes and pull-quotes), fenced code blocks with language tags, inline `` `code` ``, standard `[text](url)` links, and bare reference URLs wrapped as `<https://...>` are all already idiomatic for this site — keep them as-is.
   - Pipe-syntax Markdown tables render fine (kramdown supports them natively) — no conversion needed.
   - **Images**: this site does NOT use raw Markdown `![]()`. Post bodies embed images via `{% include framework/shortcodes/figure.html src="..." title="..." alt="..." %}`, typically wrapped in `<center>...</center>`. If the source has raw Markdown images, convert the *syntax* only (keep the same alt/title text, don't invent captions) and note that the actual image files still need to land under `assets/images/posts/<author-folder>/<n>/` — you generally won't have the binary image assets from a text export, so flag this rather than fabricate paths that don't exist on disk.
   - **Garbled/mojibake text** (e.g. corrupted emoji or arrow characters from copy-pasting out of Outline) — do not guess-repair it. Leave it as found in body content; for a front-matter field like `title` where broken bytes would land in a rendered `<title>` tag, it's fine to structurally drop the unrenderable character, but say so explicitly and describe what you found.

7. **Validate before finishing**: run `bundle exec jekyll build`, confirm the new post's output directory exists under `_site/blog/...` and (if applicable) the new category under `_site/category/...`, spot-check the rendered HTML for expected content (e.g. `grep` for a distinctive heading or the `<table>` tag). Then clean up build output (`rm -rf _site .jekyll-cache`) since it's not meant to be committed.

8. **Report to the user**: what author/categories you inferred (and why), any new category file created, and a clear list of observations — placeholder date, missing images, garbled characters, anything else that needs their input — without having fixed the article's actual wording yourself.

9. **Never commit** these changes automatically — this skill only creates/edits files; committing follows the normal "only when the user explicitly asks" rule.
