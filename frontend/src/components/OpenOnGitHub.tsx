import { useRef } from 'react'
import { useLocation } from 'react-router'

import { signInUrl } from '../api/client'
import { useMe } from '../lib/saved'
import { CheckCircleIcon, ExternalIcon, PullRequestIcon } from './icons'
import { btnPrimary, btnSecondary } from './ui'

const PERKS = [
  'Save issues and mark your progress, from "Saved" to "Merged"',
  'See your GitHub contribution graph grow',
  'Get issues picked for the languages you already use',
]

/** The issue page's main button. Signed-out visitors first get one chance to sign in, so
 *  the issue they pick up can be tracked; "Later" goes straight on to GitHub. */
export const OpenOnGitHub = ({ url }: { url: string }) => {
  const me = useMe()
  const dialog = useRef<HTMLDialogElement>(null)
  const location = useLocation()
  const className = `${btnPrimary} w-full py-3`
  const label = (
    <>
      <ExternalIcon />
      Open on GitHub
    </>
  )

  if (me.isPending || me.data) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={className}>
        {label}
      </a>
    )
  }

  const close = () => dialog.current?.close()
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={className}>
        {label}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="sign-in-title"
        // A click on the backdrop lands on the dialog itself: treat it like "close".
        onClick={(e) => e.target === e.currentTarget && close()}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-rule bg-white p-0 shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
      >
        <div className="p-6 sm:p-8">
          <span className="flex size-11 items-center justify-center rounded-xl bg-link text-white">
            <PullRequestIcon className="size-6" />
          </span>
          <h2 id="sign-in-title" className="mt-4 text-xl font-bold tracking-tight text-ink">
            Track your open source journey
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Sign in with GitHub before you start, and FirstPR keeps a record of this issue and the ones after it.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-body">
            {PERKS.map((perk) => (
              <li key={perk} className="flex gap-2">
                <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-easy" />
                {perk}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col gap-2">
            <a href={signInUrl(location.pathname)} className={`${btnPrimary} py-3`}>
              Sign in with GitHub
            </a>
            <a href={url} target="_blank" rel="noreferrer" onClick={close} className={`${btnSecondary} py-3`}>
              Later, just open on GitHub
              <ExternalIcon />
            </a>
          </div>
          <p className="mt-4 text-center text-xs text-muted">
            FirstPR only reads your public profile. It never posts or writes code for you.
          </p>
        </div>
      </dialog>
    </>
  )
}
