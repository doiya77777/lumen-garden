---
title: Evaluation Checklist for New AI Papers
date: 2026-01-17
tags:
  - ai
  - papers
  - evaluation
---

Use this checklist when reading a new paper to spot gaps early.

## Dataset and task
- Is the dataset representative of the target use case?
- Are there leakage risks or duplicated examples?
- Are baselines matched for data and compute?

## Metrics
- Are the metrics aligned with the claim?
- Is there a trade-off hidden by a single aggregate score?
- Are statistical tests or confidence intervals provided?

## Robustness
- Does performance hold across domains or languages?
- Are failure cases discussed with concrete examples?
- Is there a clear boundary of where the method fails?
