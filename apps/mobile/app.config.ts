import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json holds the config; this layer only adds what differs per EAS build profile (APP_ENV is set
 * in eas.json). Development builds talk to the local Supabase stack over plain HTTP on the Wi-Fi
 * (http://<PC LAN IP>:54321), so they relax App Transport Security and explain the Local Network
 * prompt. Preview and production builds keep ATS on: HTTPS only.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const development = process.env.APP_ENV === 'development';
  if (!development) return config as ExpoConfig;
  return {
    ...config,
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        NSAppTransportSecurity: { NSAllowsArbitraryLoads: true, NSAllowsLocalNetworking: true },
        NSLocalNetworkUsageDescription: 'Development builds of PickleDeals connect to the test server on your computer.',
      },
    },
  } as ExpoConfig;
};
