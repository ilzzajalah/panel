import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress non-critical Vite preview HMR WebSocket errors in iframe sandbox
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && (
    event.reason.message?.includes('WebSocket') || 
    event.reason.message?.includes('ws:') ||
    event.reason.toString().includes('WebSocket')
  )) {
    event.preventDefault();
  }
});

window.addEventListener('error', (event) => {
  if (event.message && (
    event.message.includes('WebSocket') || 
    event.message.includes('ws:')
  )) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(<App />);

