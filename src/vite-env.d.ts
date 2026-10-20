/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Where /api lives, for the iPhone app (which isn't served from the website). Empty on the web: same origin. */
  readonly VITE_API_ORIGIN?: string
}
