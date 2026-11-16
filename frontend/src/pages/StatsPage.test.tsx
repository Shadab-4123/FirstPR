import { screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'

import type { Stats } from '../api/client'
import { SIGNED_OUT, mockApi, renderPage } from '../test/utils'
import { StatsPage } from './StatsPage'

const scores = (accuracy: number, macro_f1: number, severe_error_rate: number) => ({ accuracy, macro_f1, severe_error_rate })

const stats: Stats = {
  issues_indexed: 1500,
  issues_available: 1240,
  repos_indexed: 610,
  last_sync: { started_at: '2026-11-16T02:30:00Z', finished_at: '2026-11-16T03:10:00Z', status: 'succeeded', issues_upserted: 133, kind: 'sync', issues_seen: 900 },
  last_recheck: null,
  recent_runs: [
    { started_at: '2026-11-16T02:30:00Z', finished_at: '2026-11-16T03:10:00Z', status: 'succeeded', issues_upserted: 133, kind: 'sync', issues_seen: 900 },
    { started_at: '2026-11-15T02:30:00Z', finished_at: null, status: 'failed', issues_upserted: 0, kind: 'recheck', issues_seen: 12 },
  ],
  model_scored: 243,
  hidden_by_reason: [{ value: 'claimed_in_comments', count: 94 }, { value: 'assigned', count: 22 }],
  by_level: [{ value: 'new', count: 900 }],
  by_language: [{ value: 'Python', count: 400 }],
  model: {
    trained_at: '2026-11-15T18:24:37Z',
    examples_used: 3291,
    test_examples: 658,
    test_period: ['2026-06-18', '2026-11-15'],
    model: scores(0.406, 0.385, 0.144),
    heuristic: scores(0.304, 0.273, 0.225),
    majority: scores(0.38, 0.184, 0.239),
    majority_predicts: 'hard',
    share_confident: 0.122,
    accuracy_when_confident: 0.613,
  },
}

it('shows the headline numbers, runs and model comparison', async () => {
  mockApi({ 'GET /api/v1/auth/me': SIGNED_OUT, 'GET /api/v1/stats': { body: stats } })
  renderPage(<StatsPage />)

  expect(await screen.findByText('1,240')).toBeInTheDocument()
  expect(screen.getByText('116')).toBeInTheDocument() // 94 + 22 hidden
  expect(screen.getByText('✕ Failed')).toBeInTheDocument()
  expect(screen.getByText('12 checked, 0 changed')).toBeInTheDocument()

  const rightSize = screen.getByText('Right size').closest('figure')!
  expect(within(rightSize).getByTitle('Our model: 41%')).toBeInTheDocument()
  expect(within(rightSize).getByTitle('Always guess "hard": 38%')).toBeInTheDocument()
  expect(screen.getByText(/sizes 243 of the 1,240 free issues/)).toBeInTheDocument()
})
