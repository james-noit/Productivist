// Apply the saved theme before the first paint. Angular's own theme effect only runs
// after bootstrap, which showed every non-light user a flash of the light palette.
// Kept as an external file (not inline) so the page also satisfies extension CSP.
try {
  var t = JSON.parse(localStorage.getItem('productivist.theme'));
  if (t) document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
