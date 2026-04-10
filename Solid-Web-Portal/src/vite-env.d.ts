/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PORTAL_WEBID?: string;
  /** Solid pod container for per–DNP3-family Typhoon simulation commands (default: dnp3_commands). */
  readonly VITE_DNP3_COMMANDS_CONTAINER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
