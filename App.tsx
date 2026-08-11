import { NavigationContainer } from '@react-navigation/native';
import { StripeProvider } from '@stripe/stripe-react-native';
import { StripeTerminalProvider } from '@stripe/stripe-terminal-react-native';
import { StatusBar } from 'expo-status-bar';
import { Fragment } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { API_URL, APPLE_MERCHANT_IDENTIFIER, STRIPE_PUBLISHABLE_KEY } from './src/config/env';

async function fetchTerminalConnectionToken() {
  const response = await fetch(`${API_URL}/connection_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const body = (await response.json()) as { secret?: string; error?: string };

  if (!response.ok || !body.secret) {
    throw new Error(body.error || 'Unable to create a Terminal connection token.');
  }

  return body.secret;
}

function FieldApp() {
  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
}

function StripeStack({ children }: { children: React.ReactElement }) {
  const app = <StripeTerminalProvider tokenProvider={fetchTerminalConnectionToken}>{children}</StripeTerminalProvider>;

  if (!STRIPE_PUBLISHABLE_KEY) {
    return app;
  }

  return (
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}
      merchantIdentifier={APPLE_MERCHANT_IDENTIFIER || undefined}
      urlScheme="dio-payments"
    >
      {app}
    </StripeProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StripeStack>
        <Fragment>
          <StatusBar style="auto" />
          <FieldApp />
        </Fragment>
      </StripeStack>
    </SafeAreaProvider>
  );
}
