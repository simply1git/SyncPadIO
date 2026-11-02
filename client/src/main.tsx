import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Auto-recover from chunk or stylesheet load errors after new deployments
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[Vite] Preload error detected, reloading to fetch latest assets:', event);
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
