import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from './lib/i18n';
import { ThemeProvider } from './lib/theme';
import { SkinProvider } from './lib/skin';
import { ToastProvider } from './lib/toast';
import { ConfirmProvider } from './lib/confirm';
import App from './App';
import { initPosture } from './lib/posture';
import './styles/theme.css';

// Keep html[data-posture] / html[data-input] live for rotate, Split View and
// trackpad attach. index.html has already set them for the first paint.
initPosture();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SkinProvider>
        <I18nProvider>
          <ToastProvider>
            <ConfirmProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </ConfirmProvider>
          </ToastProvider>
        </I18nProvider>
        </SkinProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
