import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type SavedIssue, type SavedStatus } from '../api/client'

/** The journey, in order. "Working on it" is what the plan called "claimed". */
export const STATUSES: { value: SavedStatus; label: string; hint: string; counted: string }[] = [
  { value: 'saved', label: 'Saved', hint: 'Thinking about it', counted: 'saved' },
  { value: 'working', label: 'Working on it', hint: 'You asked for it, or started coding', counted: 'in progress' },
  { value: 'pr_opened', label: 'PR opened', hint: 'Waiting for review', counted: 'PR opened' },
  { value: 'merged', label: 'Merged', hint: 'Done. Well done!', counted: 'merged' },
]


export const useMe = () => useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 5 * 60_000 })

/** The signed-in user's saved issues; idle (no request) while signed out. */
export const useSaved = () => {
  const me = useMe()
  return useQuery({ queryKey: ['saved'], queryFn: api.saved, enabled: Boolean(me.data), staleTime: 60_000 })
}

/** Save / move / remove, updating the cached list from the server's answer. */
export const useSavedActions = () => {
  const queryClient = useQueryClient()
  const put = (fresh: SavedIssue) =>
    queryClient.setQueryData<SavedIssue[]>(['saved'], (list = []) => [
      fresh,
      ...list.filter((s) => s.issue.id !== fresh.issue.id),
    ])

  const setStatus = useMutation({
    mutationFn: ({ issueId, status }: { issueId: number; status: SavedStatus }) => api.setSaved(issueId, status),
    onSuccess: put,
  })
  const remove = useMutation({
    mutationFn: (issueId: number) => api.unsave(issueId),
    onSuccess: (_, issueId) =>
      queryClient.setQueryData<SavedIssue[]>(['saved'], (list = []) => list.filter((s) => s.issue.id !== issueId)),
  })
  return { setStatus, remove }
}
