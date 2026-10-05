// Runs before the stylesheet so a saved dark theme never flashes a light canvas.
(() => {
  let theme;
  try {
    theme = localStorage.getItem('c-job-sparks:theme');
  } catch {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0c192b' : '#ffffff');
})();
