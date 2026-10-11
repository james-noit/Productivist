const SCROLL_LOCK_CLASS = 'planning-lab-open';

let locks = 0;

/**
 * Stops the page behind a drawer or a full-screen surface from scrolling (the same `planning-lab-open` class
 * the modals use). Reference-counted, so a drawer opened inside the Flow focus mode does not unlock the page
 * when it closes. Returns the function that releases this lock; calling it twice does nothing.
 */
export function lockScroll(): () => void {
  locks++;
  document.body.classList.add(SCROLL_LOCK_CLASS);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (!locks) document.body.classList.remove(SCROLL_LOCK_CLASS);
  };
}
