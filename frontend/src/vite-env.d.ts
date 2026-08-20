/// <reference types="vite/client" />

// Typed access to VITE_* env variables so `import.meta.env.VITE_FOO`
// is a string (or undefined) rather than `any`.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
