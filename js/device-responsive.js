/* Platform styles are independent of responsive width and orientation. */
(function () {
  'use strict';
  const root = document.documentElement;
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const tablet = /iPad|Tablet/i.test(ua) || (android && !/Mobile/i.test(ua)) ||
    (ios && navigator.platform === 'MacIntel') ||
    (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) >= 600);
  const platform = ios ? 'ios' : android ? 'android' : 'desktop';
  const classes = ['device-ios', 'device-android', 'device-tablet', 'device-desktop'];
  let frame = 0;

  function applyDevice(target) {
    if (!target) return;
    for (const name of classes) {
      const expected = name === 'device-' + platform || (name === 'device-tablet' && tablet);
      if (target.classList.contains(name) !== expected) target.classList.toggle(name, expected);
    }
    const viewport = window.innerWidth >= 1025 ? 'desktop' : window.innerWidth >= 769 ? 'tablet' : 'phone';
    if (target.dataset.device !== platform) target.dataset.device = platform;
    if (target.dataset.viewport !== viewport) target.dataset.viewport = viewport;
  }

  function updateViewport() {
    applyDevice(root);
    applyDevice(document.body);
    // The visible viewport shrinks when a mobile keyboard or browser toolbar opens.
    // Preserve zoom accessibility: zooming must not resize dialogs around the user.
    const viewport = window.visualViewport;
    const height = viewport && viewport.scale === 1 ? viewport.height : window.innerHeight;
    const top = viewport && viewport.scale === 1 ? viewport.offsetTop : 0;
    const heightValue = Math.round(height) + 'px';
    const topValue = Math.round(top) + 'px';
    if (root.style.getPropertyValue('--gn-visual-height') !== heightValue) root.style.setProperty('--gn-visual-height', heightValue);
    if (root.style.getPropertyValue('--gn-visual-top') !== topValue) root.style.setProperty('--gn-visual-top', topValue);
  }

  function scheduleUpdate() {
    // Safari can postpone animation frames while a form is focused. Apply the
    // observed size immediately; a later frame can settle browser toolbar changes.
    updateViewport();
    if (!frame) frame = window.requestAnimationFrame(() => {
      frame = 0;
      updateViewport();
    });
  }

  updateViewport();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateViewport, { once: true });
  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('orientationchange', scheduleUpdate, { passive: true });
  window.addEventListener('pageshow', scheduleUpdate, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleUpdate, { passive: true });
    window.visualViewport.addEventListener('scroll', scheduleUpdate, { passive: true });
  }
})();
