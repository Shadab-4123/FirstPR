import { describe, expect, it } from 'vitest'

import { mockApi } from '../test/utils'
import { ApiError, api } from './client'

describe('api client', () => {
  it('sends lists as repeated keys and skips empty values', async () => {
    const fetchMock = mockApi({ 'GET /api/v1/issues': { body: { items: [], page: 1, page_size: 20, total: 0 } } })
    await api.searchIssues({ difficulty: ['easy', 'medium'], language: '', q: 'parser' })
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost')
    expect(url.searchParams.getAll('difficulty')).toEqual(['easy', 'medium'])
    expect(url.searchParams.has('language')).toBe(false)
    expect(url.searchParams.get('q')).toBe('parser')
  })

  it("surfaces the API's own error message", async () => {
    mockApi({ 'GET /api/v1/issues/9': { status: 404, body: { error: { code: 'not_found', message: 'Issue not found.' } } } })
    const error = await api.getIssue(9).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'Issue not found.' })
  })

  it('treats 401 from /auth/me as "signed out", not an error', async () => {
    mockApi({ 'GET /api/v1/auth/me': { status: 401, body: { error: { code: 'unauthorized', message: 'x' } } } })
    await expect(api.me()).resolves.toBeNull()
  })

  it('PUTs the status as JSON when saving', async () => {
    const fetchMock = mockApi({ 'PUT /api/v1/me/saved/7': { body: {} } })
    await api.setSaved(7, 'working')
    const init = fetchMock.mock.calls[0][1]
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(String(init?.body))).toEqual({ status: 'working' })
  })
})
