import type { CapacitorConfig } from '@capacitor/cli';

// Android serves the bundle from https://localhost and iOS from capacitor://localhost: both origins must be in the
// backend's CORS_ALLOWED_ORIGINS (see backend/README.md). appId is permanent once the app is published.
const config: CapacitorConfig = {
  appId: 'com.productivist.app',
  appName: 'Productivist',
  webDir: 'dist/productivist/browser',
  plugins: {
    SplashScreen: {
      // Kept up until the Angular app has rendered once: src/core/native hides it.
      launchAutoHide: false,
      // The light theme's --color-bg (see src/style.css).
      backgroundColor: '#FFF8F0',
      showSpinner: false,
    },
    LocalNotifications: {
      // Android's status-bar icon (res/drawable/ic_stat_tomato.xml) and its tint (the light theme's --color-primary).
      smallIcon: 'ic_stat_tomato',
      iconColor: '#E85D2F',
    },
  },
};

export default config;
