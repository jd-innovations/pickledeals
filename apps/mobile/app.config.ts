import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json holds the config; this layer only adds what differs per EAS build profile (APP_ENV is set
 * in eas.json). Development builds talk to the local Supabase stack over plain HTTP on the Wi-Fi
 * (http://<PC LAN IP>:54321), so they relax App Transport Security and explain the Local Network
 * prompt. Preview and production builds keep ATS on: HTTPS only.
 *
 * Sign in with Google: the iOS client ID ("123-abc.apps.googleusercontent.com", a public value) comes
 * from EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID; its reversed form is the URL scheme Google's sheet returns to.
 * Without it the plugin is left out and the app hides the Google button.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const development = process.env.APP_ENV === 'development';
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const googleScheme = googleIosClientId ? `com.googleusercontent.apps.${googleIosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}` : null;

  const withGoogle: ExpoConfig = {
    ...(config as ExpoConfig),
    plugins: [
      ...(config.plugins ?? []),
      ...(googleScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme: googleScheme }] as [string, unknown]] : []),
    ],
  };
  if (!development) return withGoogle;
  return {
    ...withGoogle,
    ios: {
      ...withGoogle.ios,
      infoPlist: {
        ...withGoogle.ios?.infoPlist,
        NSAppTransportSecurity: { NSAllowsArbitraryLoads: true, NSAllowsLocalNetworking: true },
        NSLocalNetworkUsageDescription: 'Development builds of PickleDeals connect to the test server on your computer.',
      },
    },
  };
};
