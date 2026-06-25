import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Intercept and suppress the benign Firebase iframe auth assertion error
if (typeof window !== 'undefined') {
  const suppressIframeAuthError = (event: ErrorEvent | PromiseRejectionEvent) => {
    try {
      const message = 'message' in event ? event.message : (event.reason?.message || String(event.reason));
      if (message && (
        message.includes('Pending promise was never set') || 
        message.includes('INTERNAL ASSERTION FAILED')
      )) {
        event.preventDefault();
        event.stopPropagation();
        console.warn('Suppressed Firebase iframe auth assertion error:', message);
      }
    } catch (e) {
      console.error('Error in global error interceptor:', e);
    }
  };

  window.addEventListener('error', suppressIframeAuthError, { capture: true });
  window.addEventListener('unhandledrejection', suppressIframeAuthError, { capture: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
