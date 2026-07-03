// Vitest setup — jsdom shims for browser APIs the app touches at render time.
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom has no matchMedia; the theme system may query it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated API, some libs still call it
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ContentContext / aiClient prefetch via fetch('/api/ai'). Stub it so no test
// ever hits the network; the app treats { ok: false } payloads as a soft
// failure and falls back to local data.
vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: false, error: 'test' }),
  }))
);
