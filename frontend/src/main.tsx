import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@/lib/i18n' // Initialize i18n
import App from './App.tsx'
import { ErrorBoundary } from '@/components/error-boundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Boundary global : empêche l'écran blanc en cas d'erreur non rattrapée */}
    <ErrorBoundary variant="page" context="Application">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
