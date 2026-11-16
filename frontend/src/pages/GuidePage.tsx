import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { ArrowRightIcon, CheckIcon, ClockIcon, CopyIcon } from '../components/icons'
import { PageLayout } from '../components/SiteHeader'
import { card, eyebrow } from '../components/ui'

const STEPS = [
  { n: 1, title: "Pick an issue that's still free", stage: 'Preparation' },
  { n: 2, title: 'Ask before you start', stage: 'Communication' },
  { n: 3, title: 'Fork and clone the project', stage: 'Setup' },
  { n: 4, title: 'Make the change on a new branch', stage: 'Implementation' },
  { n: 5, title: 'Commit and push', stage: 'Packaging' },
  { n: 6, title: 'Open the pull request', stage: 'Submission' },
] as const

/** "Your first PR in 6 steps": for someone who has never contributed to open source. */
export const GuidePage = () => (
  <PageLayout>
    <header className="mx-auto max-w-3xl text-center">
      <p className={`${eyebrow} justify-center`}>A field guide for first-timers</p>
      <h1 className="mt-3 text-3xl leading-tight font-bold tracking-tight text-ink sm:text-5xl">
        Your first pull request, in 6 steps
      </h1>
      <ul className="mt-5 flex flex-wrap justify-center gap-2 text-xs font-medium">
        <li className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 shadow-card">
          <ClockIcon className="size-3.5 text-link" /> About 5 minutes to read
        </li>
        <li className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 shadow-card">
          <CheckIcon className="size-3.5 text-easy" /> No Git experience assumed
        </li>
      </ul>
    </header>

    <div className="mt-10 grid items-start gap-8 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Steps" className={`${card} hidden p-4 lg:sticky lg:top-6 lg:block`}>
        <p className="px-2 text-xs font-semibold tracking-wider text-muted uppercase">The six steps</p>
        <ol className="mt-2 space-y-0.5 text-sm">
          {STEPS.map((step) => (
            <li key={step.n}>
              <a href={`#step-${step.n}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-body hover:bg-well hover:text-link">
                <span className="flex size-5 items-center justify-center rounded-full bg-link-soft font-mono text-[0.7rem] text-link">
                  {step.n}
                </span>
                {step.title}
              </a>
            </li>
          ))}
          <li>
            <a href="#stuck" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-body hover:bg-well hover:text-link">
              <span className="flex size-5 items-center justify-center rounded-full bg-medium-soft text-[0.7rem] text-medium">?</span>
              If you get stuck
            </a>
          </li>
        </ol>
      </nav>

      <article className="min-w-0">
        <div className={`${card} p-6 sm:p-8`}>
        <p className="text-muted">
          A pull request (PR) is how you propose a change to someone else's project: you copy their code,
          change it, and ask them to take your change. Nobody expects you to know their codebase. They
          expect you to communicate.
        </p>
        <p className="mt-3 text-sm text-muted">
          You'll need a free GitHub account and Git installed. If <Code>git --version</Code> prints a version
          number in your terminal, you're ready.
        </p>
        </div>

        <ol className="mt-6 space-y-6">
          <Step n={1} title="Pick an issue that's still free">
            <p>
              Browse <Link to="/explore/new" className="text-link underline">issues for newcomers</Link>.
              FirstPR hides issues that are closed, assigned, or claimed in the comments, but things move fast:
              open the issue on GitHub and read every comment before you decide.
            </p>
            <p>
              Choose something you understand at least half of. "Fix a typo in the docs" is a perfectly good first
              PR. The goal of the first one is learning the process, not impressing anyone.
            </p>
          </Step>

          <Step n={2} title="Ask before you start">
            <p>Comment on the issue so nobody duplicates your work, and wait for a maintainer to say yes:</p>
            <Quote>
              Hi! I'd like to work on this. My plan is to change X in <Code>path/to/file</Code>. Does that sound
              right?
            </Quote>
            <p>
              Saying what you plan to do gets you better answers than "can I take this?". If nobody replies in a few
              days, it's fine to start anyway and mention that in your PR.
            </p>
          </Step>

          <Step n={3} title="Fork and clone the project">
            <p>
              Click <strong>Fork</strong> on the repo's GitHub page: that makes your own copy you're allowed to
              change. Then download it:
            </p>
            <Terminal>
              {`git clone https://github.com/YOUR-NAME/PROJECT.git
cd PROJECT
git remote add upstream https://github.com/OWNER/PROJECT.git`}
            </Terminal>
            <p>
              Look for a <Code>CONTRIBUTING.md</Code> file and follow its setup steps. It tells you how to install,
              run the tests, and what the maintainers care about.
            </p>
          </Step>

          <Step n={4} title="Make the change on a new branch">
            <Terminal>{`git switch -c fix-typo-in-readme`}</Terminal>
            <p>
              Keep the change small and focused on the issue. Don't reformat files you didn't need to touch. Run the
              project's tests before moving on, so you find problems before the reviewer does.
            </p>
          </Step>

          <Step n={5} title="Commit and push">
            <Terminal>
              {`git add README.md
git commit -m "Fix typo in installation section"
git push -u origin fix-typo-in-readme`}
            </Terminal>
            <p>Write commit messages that say what changed, so someone skimming the history understands it.</p>
          </Step>

          <Step n={6} title="Open the pull request">
            <p>
              GitHub shows a <strong>Compare &amp; pull request</strong> button after you push. In the description,
              write what you changed and why, and add <Code>Fixes #123</Code> (the issue number) so the issue closes
              automatically when your PR is merged.
            </p>
            <p>
              Then wait. Reviews can take days. When a maintainer asks for changes, that's normal, not a rejection:
              push more commits to the same branch and the PR updates itself.
            </p>
          </Step>
        </ol>

        <section id="stuck" aria-labelledby="stuck-title" className="mt-6 scroll-mt-6 rounded-2xl bg-medium-soft/60 p-6 sm:p-8">
          <h2 id="stuck-title" className="text-xl font-semibold text-ink">
            If you get stuck (everyone does)
          </h2>
          <p className="mt-1 text-sm text-muted">Maintainers want you to succeed. Here's how to handle the three most common roadblocks.</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-3">
            {STUCK.map(([title, text]) => (
              <li key={title} className="rounded-xl bg-white p-4 shadow-card">
                <p className="font-semibold text-ink">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-link p-6 text-white sm:p-8">
          <div>
            <p className="font-mono text-xs tracking-wide text-white/70 uppercase">Ready for step 1?</p>
            <p className="mt-1 text-2xl font-bold">Put it into practice</p>
            <p className="mt-1 text-sm text-white/80">Issues for newcomers are open, unclaimed and labelled by their maintainers.</p>
          </div>
          <Link
            to="/explore/new"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-link transition hover:bg-link-soft"
          >
            Find your first issue
            <ArrowRightIcon />
          </Link>
        </section>
      </article>
    </div>
  </PageLayout>
)

const STUCK = [
  ['Ask on the issue', 'Say what you tried and what happened. Specific questions get answers.'],
  ["Tests failing that you didn't touch?", 'Mention it in the PR. It may already be broken on the main branch.'],
  ['No reply for a week?', 'A polite "friendly ping" comment is fine.'],
] as const

const Step = ({ n, title, children }: { n: number; title: string; children: ReactNode }) => (
  <li id={`step-${n}`} className={`${card} scroll-mt-6 p-6 sm:p-8`}>
    <div className="flex items-start gap-4">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-link text-lg font-bold text-white"
      >
        {n}
      </span>
      <div className="min-w-0">
        <p className="font-mono text-xs tracking-wide text-muted uppercase">{STEPS[n - 1].stage}</p>
        <h2 className="text-xl font-semibold text-ink">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h2>
      </div>
    </div>
    <div className="mt-4 space-y-3 leading-relaxed text-body">{children}</div>
  </li>
)

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-link-soft px-1.5 py-0.5 font-mono text-[0.82em] text-link">{children}</code>
)

/** A terminal window with a working copy button. */
const Terminal = ({ children }: { children: string }) => {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard?.writeText(children).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  return (
    <div className="overflow-hidden rounded-xl bg-[#1e293b]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#f87171]" />
          <span className="size-2.5 rounded-full bg-[#fbbf24]" />
          <span className="size-2.5 rounded-full bg-[#34d399]" />
        </span>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white">
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed text-white">
        <code>{children}</code>
      </pre>
    </div>
  )
}

const Quote = ({ children }: { children: ReactNode }) => (
  <blockquote className="rounded-xl border-l-[3px] border-link bg-well/70 px-4 py-3 text-[0.95rem]">{children}</blockquote>
)
