// Undefined-name check for the site's browser scripts (run before every deploy).
// The app is plain scripts sharing window.Peel* modules; a name that isn't defined in its
// own module (e.g. after code moves between files) only fails when that line runs, so
// the deploy checks every script index.html loads with ESLint's no-undef rule.
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const files = [...html.matchAll(/<script[^>]*src="(js\/[^"?]+)/g)].map(m => m[1]);

// Every window.PeelX / root.PeelX a module publishes is a global for the others.
const peel = {};
for (const f of files) {
  const s = fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
  for (const m of s.matchAll(/(?:root|window|globalThis|self)\.([A-Z][A-Za-z0-9_]+)\s*=/g)) peel[m[1]] = 'readonly';
}

const browser = Object.fromEntries(`window document navigator location history localStorage sessionStorage
  console setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame
  requestIdleCallback cancelIdleCallback queueMicrotask structuredClone fetch URL URLSearchParams Blob File
  FileReader FormData Image ImageData Path2D OffscreenCanvas createImageBitmap matchMedia getComputedStyle
  Event CustomEvent PointerEvent KeyboardEvent MouseEvent ResizeObserver IntersectionObserver MutationObserver
  performance alert confirm prompt atob btoa TextEncoder TextDecoder Worker HTMLElement SVGElement Node
  DOMParser XMLSerializer XMLHttpRequest AbortController caches crypto screen innerWidth innerHeight
  devicePixelRatio scrollTo print open addEventListener removeEventListener dispatchEvent Intl CSS
  CompressionStream DecompressionStream Response Request Headers ReadableStream WritableStream
  BroadcastChannel Notification WebSocket globalThis self
  L XLSX epanet module require exports define process`.split(/\s+/).filter(Boolean).map(k => [k, 'readonly']));

export default [{
  files,
  languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...browser, ...peel } },
  // A '${…}' inside a quoted (not backtick) string prints as text (a heading leaked one).
  rules: { 'no-undef': 'error', 'no-template-curly-in-string': 'error' },
}];
