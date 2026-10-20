// The iOS app: the same Vite build (dist/), bundled into a native shell. See "iOS app" in the README.
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.lewginn.gynnasium',
  appName: 'Gynnasium',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      // Rest-over notifications are for when the app is in the background or the phone is locked.
      // In the foreground the app beeps and buzzes itself, so iOS shows nothing.
      presentationOptions: [],
    },
  },
}

export default config
