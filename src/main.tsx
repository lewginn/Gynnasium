import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import ConfirmProvider from './components/ConfirmProvider'
import { ensureExerciseLibrary } from './db/db'
import { isNative } from './native'
import { startSync } from './sync'
import './index.css'

// The iOS app carries its own copy of the build, so it has no use for the offline service worker.
if (!isNative) registerSW({ immediate: true })
void ensureExerciseLibrary()
void startSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </BrowserRouter>
  </StrictMode>,
)
