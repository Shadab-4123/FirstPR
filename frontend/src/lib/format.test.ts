import { describe, expect, it } from 'vitest'

import { plainText, pluralComments, timeAgo } from './format'

describe('plainText', () => {
  it('turns issue markdown into a readable preview', () => {
    expect(plainText('## Bug\n- Click [here](https://x.y) and see `parse_date`\n\n```py\nboom()\n```')).toBe(
      'Bug Click here and see parse_date',
    )
  })

  it('drops issue-template comments and keeps snake_case names', () => {
    expect(plainText('<!-- describe the bug -->Fails in my_module')).toBe('Fails in my_module')
  })
})

describe('timeAgo', () => {
  const now = Date.parse('2026-11-16T12:00:00Z')
  it.each([
    ['2026-11-16T11:59:30Z', 'just now'],
    ['2026-11-16T09:00:00Z', '3 hours ago'],
    ['2026-11-15T12:00:00Z', 'yesterday'],
    ['2026-08-16T12:00:00Z', '3 months ago'],
  ])('%s -> %s', (iso, expected) => {
    expect(timeAgo(iso, now)).toBe(expected)
  })
})

it('pluralises comment counts', () => {
  expect([0, 1, 5].map(pluralComments)).toEqual(['No comments yet', '1 comment', '5 comments'])
})
