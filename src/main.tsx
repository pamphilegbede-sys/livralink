import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerServiceWorkerWithWorkbox } from './utils/serviceWorkerRegistration';

// Register Service Worker with workbox-window for background push notifications
if (typeof window !== 'undefined') {
  registerServiceWorkerWithWorkbox();

  window.addEventListener('error', (event) => {
    const msg = event?.message || event?.error?.message || '';
    if (msg.includes('Pending promise was never set') || msg.includes('popup-closed-by-user')) {
      event.preventDefault();
      event.stopPropagation();
      console.warn('[LivraLink Auth Notice] Nettoyage interne du popup Firebase intercepté avec succès.');
      return true;
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const msg = reason?.message || String(reason || '');
    if (
      msg.includes('Pending promise was never set') ||
      reason?.code === 'auth/popup-closed-by-user' ||
      reason?.code === 'auth/cancelled-popup-request'
    ) {
      event.preventDefault();
      console.warn('[LivraLink Auth Notice] Rejet asynchrone popup Firebase géré avec succès.');
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);

