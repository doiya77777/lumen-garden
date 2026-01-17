---
title: AI Digest Agent Console
date: 2026-01-17
tags:
  - ai
  - agent
  - ops
---

This dashboard triggers the private agent that collects arXiv papers, summarizes them, and publishes a digest post.

Open the console here: `/agent/`

Recommended flow:
1. Run a dry run to verify summaries.
2. Disable dry run to commit the digest.
3. Wait for Vercel to redeploy and the note will appear in the blog.

Supabase auth (optional):
- Sign in with email in the console to authorize the agent and log runs.
- If Supabase is not configured, use the `AGENT_TOKEN` field instead.
