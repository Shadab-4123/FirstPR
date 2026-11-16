import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router'

import { api, signInUrl } from '../api/client'
import { useMe } from '../lib/saved'

/** "Sign in with GitHub", or the signed-in user's avatar and a sign-out button. */
export const AccountMenu = () => {
  const queryClient = useQueryClient()
  const location = useLocation()
  const me = useMe()
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.setQueryData(['me'], null)
      queryClient.removeQueries({ queryKey: ['saved'] }) // never show the last user's list
    },
  })

  if (me.isPending) return <span className="inline-block h-7 w-24" aria-hidden="true" />
  if (!me.data) {
    // Come back to the page you were on after GitHub.
    const here = location.pathname + location.search
    return (
      <a
        href={signInUrl(here)}
        className="rounded-md border border-ink px-3 py-1 text-sm font-semibold hover:bg-ink hover:text-white"
      >
        Sign in with GitHub
      </a>
    )
  }
  return (
    <span className="flex items-center gap-2 text-sm">
      {me.data.avatar_url && <img src={me.data.avatar_url} alt="" className="size-7 rounded-full" />}
      <span className="font-semibold">{me.data.login}</span>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="text-muted hover:text-ink disabled:opacity-50"
      >
        Sign out
      </button>
    </span>
  )
}
