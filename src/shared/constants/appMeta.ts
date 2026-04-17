/** Semver from root `package.json`, injected at build time via Vite (`vite.config.ts` `define`). */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION;
