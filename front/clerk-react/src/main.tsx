import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ClerkProvider } from '@clerk/react'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={'pk_test_cG9wdWxhci1weXRob24tMzIuY2xlcmsuYWNjb3VudHMuZGV2JA'}>
      <App />
    </ClerkProvider>
  </StrictMode>,
)