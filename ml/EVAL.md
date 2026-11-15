# Difficulty model: evaluation

**Summary:** a logistic regression trained on 2,633 real issues predicts effort band (easy / medium / hard) with **40.6% accuracy** on 658 newer issues it never saw. The hand-written heuristic FirstPR used before scores **30.4%**, which is worse than always guessing "hard" (38.0%). The biggest gain is in serious mistakes: the model calls an easy issue hard, or a hard one easy, **14.4%** of the time, against **22.5%** for the heuristic. The model beats both baselines, but by a modest margin. Predicting effort from issue text alone is hard, and the numbers say so.

Every number below comes from `results.json`, produced by `python -m app.ml.train` (fixed random seed, so it is reproducible from the same data).

## Data

- **Source:** closed GitHub issues labelled "good first issue" that were fixed by a merged pull request, collected with `app/ml/collect.py`. The PR shows how much work the issue really took.
- **Collected:** 4,020 issues from 1,724 repos, in 10 languages (about 400 each), closed between 30 Nov 2024 and 15 Nov 2026. Collection spreads each language's quota evenly across 30-day windows, so every period is represented.
- **Leakage guard:** features use only what was visible while the issue was open. Comments posted after the PR was opened are dropped at collection time, because they usually discuss the fix.
- Repos under 10 stars are excluded, matching the live sync.

| Filter | Dropped | Why |
| --- | ---: | --- |
| PR opened less than 1 hour after the issue | 679 | The author was documenting work already in progress, not leaving a task for someone else |
| 0 lines changed, or more than 5,000 | 50 | Empty or generated changes (lockfiles, vendored code), not human effort |
| **Used** | **3,291** | |

## Labels (effort bands)

Defined from the merged PR, with cutoffs near the data's thirds (median PR: 41 lines, 2 files), rounded so they fit in one sentence:

| Band | Rule | Share of data |
| --- | --- | ---: |
| Easy | ≤ 20 lines **and** ≤ 2 files | 30% |
| Medium | everything else | 33% |
| Hard | > 100 lines **or** > 5 files | 37% |

## Protocol

1. Examples are sorted by when the issue closed. The **oldest 80% is the training set** (30 Nov 2024 to 18 Jun 2026, 2,633 issues). The **newest 20% is the test set** (18 Jun to 15 Nov 2026, 658 issues). Splitting by time, not at random, means the model is always judged on issues from after the ones it learned from, which is how it is used for real.
2. Two candidates were compared on a **validation slice cut from the end of the training period**: logistic regression (macro-F1 0.434) and gradient boosting (0.386). Logistic regression was chosen, then refit on the full training set.
3. The test set was scored **once**, after that choice.

## Results (test set: 658 issues)

| Approach | Accuracy | Macro-F1 | Severe errors (easy↔hard) |
| --- | ---: | ---: | ---: |
| Always guess "hard" (most common band) | 38.0% | 0.184 | 23.9% |
| Hand-written heuristic (previous site default) | 30.4% | 0.273 | 22.5% |
| **Logistic regression (this model)** | **40.6%** | **0.385** | **14.4%** |

Macro-F1 averages the three bands equally, so a model can't score well by favouring one band.

**Confusion matrices** (rows = actual band, columns = predicted):

| Heuristic | → easy | → medium | → hard |
| --- | ---: | ---: | ---: |
| easy | 115 | 36 | 6 |
| medium | 170 | 68 | 13 |
| hard | **142** | 91 | 17 |

| Model | → easy | → medium | → hard |
| --- | ---: | ---: | ---: |
| easy | 55 | 41 | 61 |
| medium | 44 | 54 | 153 |
| hard | **34** | 58 | 158 |

The heuristic's main failure: it labels most issues easy, including 142 of the 250 hard ones. That is the worst mistake for a newcomer. The model's main weakness is the opposite and safer one: it over-predicts hard, especially for medium issues.

### Confidence

When the model's top probability is at least 0.60, it is right **61.3%** of the time. Below that it is right **37.7%** of the time. Only **12.2%** of test issues reach that level. The UI should therefore show the estimate as a hint, with a "low confidence" note in most cases.

### Hours to merge

| Approach | Mean abs. error | Median abs. error |
| --- | ---: | ---: |
| Always predict the training median (42.4 h) | 201.0 h | 33.8 h |
| Gradient-boosted regression on log(hours) | 199.4 h | **19.4 h** |

The model halves the typical error, but the mean is dominated by a few issues that took months. More importantly, "hours from issue opened to PR merged" mostly measures *waiting* (for someone to pick it up, for a review), not coding time. **Don't show this as "time to fix".** At most, it's a rough "how long these usually take to land".

## What the model learned

Strongest signals, from the logistic regression's weights (hard vs easy):

- **Toward hard:** inline code in the description, many labels, task-list checkboxes, Rust repos, more discussion before the fix, issues written by maintainers.
- **Toward easy:** repos with many forks (active communities tend to slice work smaller), docs/typo/beginner labels.
- **Surprising:** "hard" labels such as refactor or performance push slightly toward *easy*. They are rare among good-first-issues, so the model can't learn them well. This is a data-size limit, not a finding.

## Limitations

- **Repo stars and forks are measured at collection time,** not when each issue was open: a small leak, in favour of the model.
- **Text only.** The model can't see the codebase, so it can't know a "one-line fix" sits in a 3,000-line file.
- **Effort ≠ difficulty.** Lines and files changed measure the size of the fix. A 5-line change to a concurrency bug can be harder than a 200-line docs rewrite.
- **"Maintainer gave guidance" isn't a feature,** although the blueprint suggested it. Live issues don't store who commented, so the model would see it in training but not in production.
- **One test period.** Results could shift with more data or a different time window; retrain and re-evaluate as the dataset grows.

## Decision

Ship the model in place of the heuristic, because it beats it on every measure and especially on severe errors. Show its estimate with a confidence note, and don't present hours as time-to-fix.

**Follow-up after a dry run on live issues:** the model's lean toward "hard" (it predicted hard for 56% of test issues; 38% really were) would have cut the "New to open source" level to about a fifth of its size if that level required "easy". The level rule therefore accepts **easy or medium** for good-first-issues (`app/scoring/classify.py`). The issue page shows only reasons about the issue's content. Title length and repo size are real signals in the model, but they read confusingly as explanations ("short title → hard").
