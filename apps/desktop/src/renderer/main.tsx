import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Diagnostics } from './diagnostics.js';
import { DocumentPreview } from './document-preview.js';
import './styles.css';
const container = document.getElementById('root');
if (container === null) throw new Error('renderer root element is missing');
createRoot(container).render(
  <StrictMode>
    {window.location.hash === '#diagnostics' ? (
      <Diagnostics />
    ) : (
      <main>
        <DocumentPreview />
      </main>
    )}
  </StrictMode>,
);
