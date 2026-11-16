import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router'

import { api, signInUrl } from '../api/client'
import { useMe } from '../lib/saved'
import { btnPrimary } from './ui'

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

  if (me.isPending) return <span className="inline-block h-9 w-28" aria-hidden="true" />
  if (!me.data) {
    // Come back to the page you were on after GitHub.
    const here = location.pathname + location.search
    return (
      <a href={signInUrl(here)} className={`${btnPrimary} px-4 py-2`}>
        Sign in with GitHub
      </a>
    )
  }
  return (
    <span className="flex items-center gap-2.5">
      {me.data.avatar_url && (
        <img src={me.data.avatar_url} alt="" className="size-9 rounded-full border border-rule" />
      )}
      <span className="flex flex-col leading-tight">
        <span className="font-mono text-xs text-ink">{me.data.login}</span>
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="text-left text-xs text-muted hover:text-link disabled:opacity-50"
        >
          Sign out
        </button>
      </span>
    </span>
  )
}
