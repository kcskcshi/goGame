/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_GEMINI_ACCESS_KEY: string
  readonly VITE_GEMINI_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
