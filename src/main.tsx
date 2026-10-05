import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { ErrorBoundary } from './views/components/common/ErrorBoundary';
import { ThemeProvider } from './controllers/ThemeContext';
import './views/styles/globals.css';

const PRELOAD_RECOVERY_KEY = 'c-job-sparks:preload-recovery';

window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem(PRELOAD_RECOVERY_KEY)) return;
    sessionStorage.setItem(PRELOAD_RECOVERY_KEY, 'pending');
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

window.setTimeout(() => {
  try {
    sessionStorage.removeItem(PRELOAD_RECOVERY_KEY);
  } catch {
    // Recovery remains opt-in when session storage is unavailable.
  }
}, 10_000);

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
