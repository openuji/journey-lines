import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Report } from './Report';
import '../../ui/styles.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Report />
  </StrictMode>,
);
