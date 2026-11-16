import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { reportError, startMonitoring } from './lib/monitoring'
import './index.css'

void startMonitoring()

createRoot(document.getElementById('root')!, {
  // A render crash nothing caught: report it, and keep React's default console log.
  onUncaughtError: (error, info) => {
    reportError(error)
    console.error(error, info.componentStack)
  },
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
