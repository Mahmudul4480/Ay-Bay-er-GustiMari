import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { authReady } from './firebaseConfig';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

const rootEl = document.getElementById('root')!;

authReady
  .catch((err) => console.error('Auth persistence:', err))
  .finally(() => {
    createRoot(rootEl).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
  });
