/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Absolute base URL of the API (e.g. https://outreachapi-...up.railway.app).
  // When set, the app calls the API directly; when unset it uses a same-origin
  // /api path (proxied by nginx in prod / the Vite dev server in dev).
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
