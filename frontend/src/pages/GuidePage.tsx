import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { SiteHeader } from '../components/SiteHeader'

/** "Your first PR in 6 steps": for someone who has never contributed to open source. */
export const GuidePage = () => (
  <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-8">
    <SiteHeader />
    <main className="pt-8 sm:pt-14">
      <article className="max-w-[68ch]">
        <h1 className="font-display text-3xl leading-tight font-semibold sm:text-4xl">
          Your first pull request, in 6 steps
        </h1>
        <p className="mt-3 text-muted">
          A pull request (PR) is how you propose a change to someone else's project: you copy their code,
          change it, and ask them to take your change. Nobody expects you to know their codebase. They
          expect you to communicate.
        </p>
        <p className="mt-3 text-sm text-muted">
          You'll need a free GitHub account and Git installed. If <Code>git --version</Code> prints a version
          number in your terminal, you're ready.
        </p>

        <ol className="mt-10 space-y-10">
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

        <section className="mt-12 border-t border-rule pt-8">
          <h2 className="font-display text-xl font-semibold">If you get stuck</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Ask on the issue. Say what you tried and what happened. Specific questions get answers.</li>
            <li>Tests failing that you didn't touch? Mention it in the PR. It may already be broken on the main branch.</li>
            <li>No reply for a week? A polite "friendly ping" comment is fine.</li>
          </ul>
        </section>

        <Link
          to="/explore/new"
          className="mt-10 inline-block rounded-md bg-ink px-5 py-3 font-semibold text-white hover:bg-link"
        >
          Find your first issue
        </Link>
      </article>
    </main>
  </div>
)

const Step = ({ n, title, children }: { n: number; title: string; children: ReactNode }) => (
  <li className="grid grid-cols-[2.25rem_1fr] gap-x-4">
    <span
      aria-hidden="true"
      className="flex size-9 items-center justify-center rounded-full bg-ink font-display font-semibold text-white"
    >
      {n}
    </span>
    <div className="min-w-0">
      <h2 className="font-display text-xl font-semibold">
        <span className="sr-only">Step {n}: </span>
        {title}
      </h2>
      <div className="mt-2 space-y-3 leading-relaxed">{children}</div>
    </div>
  </li>
)

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-white px-1 py-0.5 text-[0.9em]">{children}</code>
)

const Terminal = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto rounded-md border border-rule bg-ink p-4 text-sm leading-relaxed text-white">
    <code>{children}</code>
  </pre>
)

const Quote = ({ children }: { children: ReactNode }) => (
  <blockquote className="rounded-md border-l-4 border-link bg-white px-4 py-3 text-[0.95rem]">{children}</blockquote>
)
