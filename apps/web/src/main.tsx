import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { captureRef } from '@/lib/ref';
import './index.css';

captureRef();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
