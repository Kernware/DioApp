module.exports = ({ config }) => ({
  ...config,
  name: 'DIO Payments',
  slug: 'dio-payments',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'dio-payments',
  userInterfaceStyle: 'automatic',
  ios: {
    ...config.ios,
    bundleIdentifier: 'com.dio.payments',
    supportsTablet: true,
    // Written into the Xcode project so signing works when opening it directly.
    appleTeamId: process.env.APPLE_TEAM_ID || '7W27W5NRFK'
  },
  android: {
    ...config.android,
    package: 'com.dio.payments'
  },
  plugins: [
    // Stripe Terminal requires API 26.
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
    [
      '@stripe/stripe-react-native',
      {
        // Only set once the merchant ID exists in Apple Developer. A placeholder adds
        // an Apple Pay entitlement that no provisioning profile can satisfy, which
        // fails iOS code signing.
        merchantIdentifier: process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER || '',
        enableGooglePay: true
      }
    ],
    ['@stripe/stripe-terminal-react-native', { tapToPayCheck: true }],
    'expo-secure-store',
    'expo-sqlite',
    'expo-sharing'
  ]
});
