import type { Issue, SavedIssue } from '../api/client'

export const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: 1,
  number: 42,
  title: 'Fix the date parser',
  body_excerpt: 'The **parser** fails on `2026-01-01`.',
  html_url: 'https://github.com/acme/widgets/issues/42',
  labels: ['good first issue'],
  comments_count: 2,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-10T00:00:00Z',
  is_available: true,
  unavailable_reason: null,
  difficulty_label: 'easy',
  level: 'new',
  kind: 'bug',
  repo: {
    id: 1,
    full_name: 'acme/widgets',
    description: null,
    html_url: 'https://github.com/acme/widgets',
    language: 'Python',
    topics: [],
    stars: 1200,
    pushed_at: '2026-11-10T00:00:00Z',
    health_score: 80,
  },
  score_breakdown: {
    difficulty: { label: 'easy', score: null, reasons: [], method: 'model_v1', confidence: 0.7 },
    health: { score: 80, reasons: [], method: 'baseline_heuristic' },
  },
  ...overrides,
})

export const makeSaved = (overrides: Partial<SavedIssue> = {}): SavedIssue => ({
  status: 'saved',
  saved_at: '2026-11-12T00:00:00Z',
  updated_at: '2026-11-12T00:00:00Z',
  issue_state: 'open',
  issue: makeIssue(),
  ...overrides,
})
