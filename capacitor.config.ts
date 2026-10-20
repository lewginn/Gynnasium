import type { CapacitorConfig } from '@capacitor/cli'

// The iPhone app wraps the same build as the website (dist/). See README → "iPhone app".
const config: CapacitorConfig = {
  appId: 'app.gynnasium',
  appName: 'Gynnasium',
  webDir: 'dist',
  ios: {
    contentInset: 'never', // the CSS handles safe areas itself (env(safe-area-inset-*))
  },
}

export default config
