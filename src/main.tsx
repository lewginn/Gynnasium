import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import ConfirmProvider from './components/ConfirmProvider'
import { ensureExerciseLibrary } from './db/db'
import { startSync } from './sync'
import './index.css'

registerSW({ immediate: true })
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
