/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PORTAL_WEBID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
