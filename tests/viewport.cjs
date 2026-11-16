// An older WebView can keep visualViewport at full-screen size while native bounds shrink.
// It must never overwrite the Android-owned viewport with that stale measurement.
const assert = require('node:assert/strict');
const path = require('node:path');
const dep = path.join(__dirname, '../upstream/node_modules');
const { JSDOM } = require(path.join(dep, 'jsdom'));
const dom = new JSDOM('<!doctype html><body/>', { url: 'https://ds.mobile.local', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Event']) {
  Object.defineProperty(global, key, { value: dom.window[key], configurable: true });
}
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
const viewport = new window.EventTarget();
Object.assign(viewport, { height: 860, offsetTop: 0, scale: 1 });
Object.defineProperty(window, 'visualViewport', { value: viewport });
global.requestAnimationFrame = fn => setTimeout(fn, 0);
global.cancelAnimationFrame = clearTimeout;
const React = require(path.join(dep, 'react'));
const { render, fireEvent, act, cleanup } = require(path.join(dep, '@testing-library/react'));
const { useMobileViewport } = require('../upstream/.tests/ui.cjs');
function Harness() {
  const ref = useMobileViewport(true);
  return React.createElement('div', { ref, 'data-testid': 'frame' }, React.createElement('textarea'));
}
(async () => {
  document.documentElement.setAttribute('data-ds-native', 'true');
  const native = render(React.createElement(Harness));
  const frame = native.getByTestId('frame');
  const input = frame.querySelector('textarea');
  input.focus();
  // Keyboard opening, candidate-row expansion, closing, rotation: physical viewport changes
  // while old WebView visualViewport stays stale. Native sizing must remain the sole owner.
  for (const height of [850, 600, 470, 420, 470, 650, 850, 360]) {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    await act(async () => {
      viewport.dispatchEvent(new window.Event('resize'));
      fireEvent.resize(window);
      await new Promise(r => setTimeout(r, 2));
    });
    assert.equal(frame.style.getPropertyValue('--app-viewport-height'), '', `stale resize at ${height}`);
    assert.equal(frame.style.getPropertyValue('--app-viewport-top'), '');
    assert.equal(document.activeElement, input, 'resize must preserve input focus');
  }
  cleanup();
  document.documentElement.removeAttribute('data-ds-native');
  const browser = render(React.createElement(Harness));
  const browserFrame = browser.getByTestId('frame');
  browserFrame.querySelector('textarea').focus();
  viewport.height = 470;
  viewport.offsetTop = 20;
  await act(async () => {
    viewport.dispatchEvent(new window.Event('resize'));
    await new Promise(r => setTimeout(r, 2));
  });
  assert.equal(browserFrame.style.getPropertyValue('--app-viewport-height'), '470px');
  assert.equal(browserFrame.style.getPropertyValue('--app-viewport-top'), '20px');
  cleanup();
  console.log('PASS: native viewport ownership despite stale WebView measurements; open/close/resize/orientation; preserved focus; browser visualViewport fallback.');
})().catch(e => { console.error(e); process.exit(1); });
