import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { session } from '../auth/session';

// jsdom has no layout, so it cannot scroll; pages scroll to the top when they change.
window.scrollTo = () => {};

afterEach(() => {
  cleanup();
  session.end(null);
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
