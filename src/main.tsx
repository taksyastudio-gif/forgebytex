import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loader } from '@monaco-editor/react';

import App from './App';
import './index.css';

/**
 * Monaco is served from public/monaco so editor workers and language assets
 * remain local and do not depend on a CDN.
 */
loader.config({
  paths: {
    vs: '/monaco/vs',
  },
});

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error(
    'VLNTOX could not start because the root element is missing.',
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);