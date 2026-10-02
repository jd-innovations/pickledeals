import { palette } from '@pickledeals/shared';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import './index.css';

// Design tokens → CSS variables, so admin styles stay on the shared palette.
const root = document.documentElement;
for (const [name, value] of Object.entries(palette.light)) {
  root.style.setProperty(`--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, value);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
