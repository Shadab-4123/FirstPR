import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'

import { SearchPage } from './pages/SearchPage'

// The brief pulls in a markdown renderer; load it only when someone opens an issue,
// so the search page (where everyone lands) stays small.
const IssuePage = lazy(() => import('./pages/IssuePage').then((m) => ({ default: m.IssuePage })))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route
          path="/issues/:id"
          element={
            <Suspense fallback={null}>
              <IssuePage />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
)
