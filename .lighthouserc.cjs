const lighthousePaths = process.env.LIGHTHOUSE_PATHS
  ? process.env.LIGHTHOUSE_PATHS.split(',').map((path) => path.trim()).filter(Boolean)
  : ['/login', '/register', '/registration-status'];
const sessionCookie = process.env.LIGHTHOUSE_SESSION_COOKIE;

module.exports = {
  ci: {
    collect: {
      startServerCommand: 'pnpm preview -- --host 127.0.0.1',
      startServerReadyPattern: 'Local:',
      url: lighthousePaths.map((path) => `http://127.0.0.1:4173${path}`),
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        chromeFlags: '--no-sandbox --headless=new',
        ...(sessionCookie ? { extraHeaders: { Cookie: sessionCookie } } : {}),
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.75 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
      },
    },
    upload: { target: 'temporary-public-storage' },
  },
};
