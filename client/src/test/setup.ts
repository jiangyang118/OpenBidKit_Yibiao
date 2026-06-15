import '@testing-library/jest-dom/vitest';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: window.ResizeObserver || ResizeObserverStub,
  });

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: window.matchMedia || ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })),
  });
}
