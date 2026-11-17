import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'

import { ResultsSkeleton } from './components/ResultStates'
import { PageLayout } from './components/SiteHeader'
import { SearchPage } from './pages/SearchPage'

// The brief pulls in a markdown renderer; load it only when someone opens an issue,
// so the search page (where everyone lands) stays small.
const IssuePage = lazy(() => import('./pages/IssuePage').then((m) => ({ default: m.IssuePage })))
const ExplorePage = lazy(() => import('./pages/ExplorePage').then((m) => ({ default: m.ExplorePage })))
const LevelPage = lazy(() => import('./pages/LevelPage').then((m) => ({ default: m.LevelPage })))
const MyIssuesPage = lazy(() =>
  import('./pages/MyIssuesPage').then((m) => ({ default: m.MyIssuesPage })),
)
const ForYouPage = lazy(() => import('./pages/ForYouPage').then((m) => ({ default: m.ForYouPage })))
const StatsPage = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })))
const GuidePage = lazy(() => import('./pages/GuidePage').then((m) => ({ default: m.GuidePage })))

// While a page's code downloads, show the site frame with loading cards, not a blank screen.
const Lazy = ({ page }: { page: ReactNode }) => (
  <Suspense
    fallback={
      <PageLayout>
        <ResultsSkeleton />
      </PageLayout>
    }
  >
    {page}
  </Suspense>
)

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export const App = () => (
  <QueryClientProvider client={queryClient}>
    {/* Without transitions, a URL change re-renders at once. With them (the default), a second
        filter picked right after the first was built from the stale URL and dropped the first. */}
    <BrowserRouter useTransitions={false}>
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/issues/:id" element={<Lazy page={<IssuePage />} />} />
        <Route path="/explore" element={<Lazy page={<ExplorePage />} />} />
        <Route path="/explore/:level" element={<Lazy page={<LevelPage />} />} />
        <Route path="/guide" element={<Lazy page={<GuidePage />} />} />
        <Route path="/stats" element={<Lazy page={<StatsPage />} />} />
        <Route path="/for-you" element={<Lazy page={<ForYouPage />} />} />
        <Route path="/my-issues" element={<Lazy page={<MyIssuesPage />} />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
)
