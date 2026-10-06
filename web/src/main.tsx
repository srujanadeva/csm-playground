/** Entry point: fonts, styles, translations, data cache, auth, toasts and the router. */
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/noto-sans-kannada/400.css'
import '@fontsource/noto-sans-kannada/500.css'
import '@fontsource/noto-sans-kannada/600.css'
import './styles/app.css'
import './i18n.ts'
import { AuthProvider } from './app/auth.tsx'
import { ToastProvider } from './components/Toast.tsx'
import { Loading } from './components/Widgets.tsx'
import { router } from './router.tsx'
import { ApiError } from './api/client.ts'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Don't retry client errors (403, 404, validation); retry network hiccups once.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<Loading testId="app-loading" />}>
        <AuthProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </AuthProvider>
      </Suspense>
    </QueryClientProvider>
  </StrictMode>,
)
