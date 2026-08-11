import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PaymentScreen } from '../screens/PaymentScreen';
import { colors } from '../ui/theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Payment"
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.background }
      }}
    >
      <Stack.Screen name="Payment" options={{ headerShown: false }}>
        {({ route }) => <PaymentScreen initialAmountCents={route.params?.amountCents} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
