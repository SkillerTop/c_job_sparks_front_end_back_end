import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { ErrorBoundary } from './views/components/common/ErrorBoundary';
import { ThemeProvider } from '@/controllers/ThemeContext';
import './views/styles/globals.css';
import { startWebVitalsRum } from '@/services/webVitalsRum';

const PRELOAD_RECOVERY_KEY = 'c-job-sparks:preload-recovery';

window.addEventListener('vite:preloadError', (event) => {
  // A stale HTML document may refer to chunks removed by a deployment. Reload
  // once so the browser receives the current document, but keep the marker for
  // the lifetime of the tab. Clearing it on a timer can create an endless
  // reload loop while the deployment or proxy remains inconsistent.
  event.preventDefault();
  try {
    if (sessionStorage.getItem(PRELOAD_RECOVERY_KEY)) return;
    sessionStorage.setItem(PRELOAD_RECOVERY_KEY, 'pending');
  } catch {
    return;
  }
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <BrowserRouter basename={import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL}>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);

startWebVitalsRum();
