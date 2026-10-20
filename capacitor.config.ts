import type { CapacitorConfig } from '@capacitor/cli'

// The iPhone app wraps the same build as the website (dist/). See README → "iPhone app".
const config: CapacitorConfig = {
  appId: 'app.gynnasium',
  appName: 'Gynnasium',
  webDir: 'dist',
  ios: {
    contentInset: 'never', // the CSS handles safe areas itself (env(safe-area-inset-*))
    // The theme's --bg, so the web view never flashes white before the page paints.
    backgroundColor: '#0d0d0d',
  },
}

export default config
