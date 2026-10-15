import { LAYERS } from '@auralide/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('renderer root element is missing');
}

/**
 * P0 renderer shell: proves the Electron + Vite + React + workspace-package pipeline end to end.
 * No editor surface exists yet.
 */
createRoot(container).render(
  <StrictMode>
    <main className="shell">
      <h1>Auralide</h1>
      <p>P0 infrastructure scaffold — no editor functionality yet.</p>
      <p className="layers">Architecture layers: {LAYERS.join(' · ')}</p>
    </main>
  </StrictMode>,
);
