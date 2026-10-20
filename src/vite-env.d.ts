/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** The deployed web app, e.g. https://gynnasium.vercel.app. Only the iOS app uses it (src/native). */
  readonly VITE_WEB_URL?: string
}
