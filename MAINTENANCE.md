# Lumen Garden Maintenance (AI Quick Iteration)

Purpose: keep updates fast, safe, and consistent.

## Where to edit
- Write notes in `content/` (Markdown).
- Homepage is `content/index.md`.
- Site config is `quartz.config.ts`.

## Add a new note
- Create `content/notes/<slug>.md`.
- Include frontmatter:
  - `title`
  - `date` (YYYY-MM-DD)
  - `tags` (list)

Example:
```
---
title: Example Note
date: 2026-01-17
tags:
  - ai
  - papers
---

Your content here.
```

## Keep it simple
- Use short sections and bullet points.
- Link related notes with `[[notes/slug]]`.
- Avoid heavy formatting unless needed.

## Publish
- `git add .`
- `git commit -m "update note"`
- `git push`

Vercel will rebuild automatically.

## Common fixes
- Root page missing: ensure `content/index.md` exists.
- Wrong site title/domain: edit `quartz.config.ts`.
