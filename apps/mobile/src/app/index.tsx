import { Redirect } from 'expo-router';

/** Launch URL "/" (app start, dev-client and plain scheme links) opens the Deals tab. */
export default function Index() {
  return <Redirect href="/deals" />;
}
