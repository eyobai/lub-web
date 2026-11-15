import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { session } from '../auth/session';

afterEach(() => {
  cleanup();
  session.end(null);
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
