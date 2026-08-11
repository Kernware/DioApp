import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BankTransferQr } from '../payments/BankTransferQr';
import { InvoiceQr } from '../payments/InvoiceQr';
import { PaymentLinkQr } from '../payments/PaymentLinkQr';
import { DEMO_MODE, TERMINAL_LOCATION_ID, TERMINAL_SIMULATED } from '../config/env';
import { formatAmount } from '../domain/types';

const DONATION_AMOUNTS = [500, 1000, 2000];

type AmountPickerProps = {
  amountCents: number;
  customAmount: string;
  onPresetChange: (amountCents: number) => void;
  onCustomChange: (value: string) => void;
};

function AmountPicker({
  amountCents,
  customAmount,
  onPresetChange,
  onCustomChange
}: AmountPickerProps) {
  return (
    <View style={styles.amountPicker}>
      {DONATION_AMOUNTS.map((option) => (
        <Pressable
          key={option}
          accessibilityRole="button"
          accessibilityState={{ selected: option === amountCents }}
          onPress={() => onPresetChange(option)}
          style={[styles.amountOption, option === amountCents && styles.amountOptionSelected]}
        >
          <Text
            style={[
              styles.amountOptionText,
              option === amountCents && styles.amountOptionTextSelected
            ]}
          >
            {formatAmount(option)}
          </Text>
        </Pressable>
      ))}
      <View style={styles.customAmountBox}>
        <Text style={styles.customAmountPrefix}>€</Text>
        <TextInput
          accessibilityLabel="Eigener Betrag in Euro"
          keyboardType="decimal-pad"
          onChangeText={onCustomChange}
          placeholder="Andere"
          placeholderTextColor="#94a3b8"
          style={styles.customAmountInput}
          value={customAmount}
        />
      </View>
    </View>
  );
}

type TapToPayOptionProps = {
  amountCents: number;
};

function TapToPayOption({ amountCents }: TapToPayOptionProps) {
  const [busy, setBusy] = useState(false);
  const [demoNoticeVisible, setDemoNoticeVisible] = useState(false);

  const {
    initialize,
    discoverReaders,
    connectReader,
    createPaymentIntent,
    processPaymentIntent,
    connectedReader,
    discoveredReaders,
    isInitialized
  } = useStripeTerminal();

  useEffect(() => {
    setDemoNoticeVisible(false);
  }, [amountCents]);

  useEffect(() => {
    const reader = discoveredReaders[0];

    if (!reader || connectedReader || !TERMINAL_LOCATION_ID) {
      return;
    }

    let cancelled = false;
    void connectReader({
      discoveryMethod: 'tapToPay',
      reader,
      locationId: TERMINAL_LOCATION_ID,
      merchantDisplayName: 'DIO Payments',
      tosAcceptancePermitted: true,
      autoReconnectOnUnexpectedDisconnect: true
    }).then((result) => {
      if (cancelled) {
        return;
      }

      if (result.error) {
        Alert.alert('Tap to Pay', result.error.message);
        return;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [connectReader, connectedReader, discoveredReaders]);

  const prepareTapToPay = async () => {
    if (DEMO_MODE || !TERMINAL_LOCATION_ID) {
      setDemoNoticeVisible(true);
      return;
    }

    setDemoNoticeVisible(false);
    setBusy(true);

    try {
      if (!isInitialized) {
        const initialized = await initialize();

        if (initialized?.error) {
          Alert.alert('Tap to Pay', initialized.error.message);
          return;
        }
      }

      const result = await discoverReaders({
        discoveryMethod: 'tapToPay',
        simulated: TERMINAL_SIMULATED
      });

      if (result.error) {
        Alert.alert('Tap to Pay', result.error.message);
        return;
      }
    } catch (error) {
      Alert.alert(
        'Tap to Pay',
        error instanceof Error ? error.message : 'Tap to Pay konnte nicht vorbereitet werden.'
      );
    } finally {
      setBusy(false);
    }
  };

  const collectDonation = async () => {
    if (!connectedReader) {
      await prepareTapToPay();
      return;
    }

    setBusy(true);

    try {
      const created = await createPaymentIntent({
        amount: amountCents,
        currency: 'eur',
        paymentMethodTypes: ['cardPresent'],
        captureMethod: 'automatic',
        description: 'Door-to-door donation',
        metadata: { source: 'door-to-door-donation' }
      });

      if (created.error || !created.paymentIntent) {
        throw new Error(created.error?.message || 'Die Spende konnte nicht erstellt werden.');
      }

      const processed = await processPaymentIntent({
        paymentIntent: created.paymentIntent,
        skipTipping: true,
        skipDonation: true
      });

      if (processed.error) {
        throw new Error(processed.error.message);
      }

      Alert.alert('Spende erhalten', `${formatAmount(amountCents)} wurde erfolgreich bezahlt.`);
    } catch (error) {
      Alert.alert(
        'Zahlung fehlgeschlagen',
        error instanceof Error ? error.message : 'Die Spende konnte nicht bezahlt werden.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={connectedReader ? collectDonation : prepareTapToPay}
        style={({ pressed }) => [
          styles.primaryButton,
          busy && styles.buttonDisabled,
          pressed && styles.buttonPressed
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {connectedReader ? `Spende ${formatAmount(amountCents)} kassieren` : 'Tap to Pay'}
          </Text>
        )}
      </Pressable>

      {demoNoticeVisible ? (
        <View style={styles.dropdownNotice}>
          <Text style={styles.dropdownNoticeText}>Nicht verfügbar in Demo Version</Text>
        </View>
      ) : null}
    </View>
  );
}

type PaymentScreenProps = {
  initialAmountCents?: number;
};

export function PaymentScreen({ initialAmountCents }: PaymentScreenProps) {
  const [amountCents, setAmountCents] = useState(initialAmountCents ?? 1000);
  const [customAmount, setCustomAmount] = useState('');

  const selectPresetAmount = (nextAmountCents: number) => {
    setCustomAmount('');
    setAmountCents(nextAmountCents);
  };

  const updateCustomAmount = (value: string) => {
    const normalized = value.replace(',', '.');
    setCustomAmount(value);

    if (!normalized.trim()) {
      setAmountCents(0);
      return;
    }

    const euros = Number(normalized);

    if (Number.isFinite(euros) && euros > 0) {
      setAmountCents(Math.round(euros * 100));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Spende notieren</Text>
          <View style={styles.demoBadge}>
            <Text style={styles.demoBadgeText}>DEMO</Text>
          </View>
        </View>

        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Spendenbetrag</Text>
          <Text style={styles.amount}>{amountCents > 0 ? formatAmount(amountCents) : 'Betrag wählen'}</Text>
          <AmountPicker
            amountCents={amountCents}
            customAmount={customAmount}
            onCustomChange={updateCustomAmount}
            onPresetChange={selectPresetAmount}
          />
        </View>

        <View style={styles.optionGroup}>
          <View style={styles.optionItem}>
            <Text style={styles.optionHeader}>1. Kartenzahlung</Text>
            <TapToPayOption amountCents={amountCents} />
          </View>

          <View style={styles.optionItem}>
            <Text style={styles.optionHeader}>2. Zahlungslink</Text>
            <PaymentLinkQr amountCents={amountCents} />
          </View>

          <View>
            <Text style={styles.optionHeader}>3. Banküberweisung</Text>
            <BankTransferQr amountCents={amountCents} />
          </View>
        </View>

        <View style={styles.optionGroup}>
          <Text style={styles.optionHeader}>4. Beleg erstellen</Text>
          <InvoiceQr amountCents={amountCents} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 22, paddingBottom: 36 },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 16
  },
  eyebrow: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5
  },
  demoBadge: {
    backgroundColor: '#dcfce7',
    borderColor: '#15803d',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  demoBadgeText: {
    color: '#15803d',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1
  },
  title: {
    color: '#0f172a',
    flex: 1,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
    marginBottom: 0
  },
  description: { color: '#475569', fontSize: 16, lineHeight: 24, marginBottom: 20 },
  amountCard: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    marginBottom: 16,
    padding: 20
  },
  amountLabel: { color: '#cbd5e1', fontSize: 14, marginBottom: 6 },
  amount: { color: '#ffffff', fontSize: 34, fontWeight: '800', marginBottom: 16 },
  amountPicker: { flexDirection: 'row', gap: 8 },
  amountOption: {
    alignItems: 'center',
    borderColor: '#475569',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center'
  },
  amountOptionSelected: { backgroundColor: '#ffffff', borderColor: '#ffffff' },
  amountOptionText: { color: '#e2e8f0', fontSize: 15, fontWeight: '700' },
  amountOptionTextSelected: { color: '#0f172a' },
  customAmountBox: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1.35,
    flexDirection: 'row',
    minHeight: 42,
    paddingHorizontal: 8
  },
  customAmountPrefix: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  customAmountInput: {
    color: '#0f172a',
    flex: 1,
    fontSize: 15,
    minHeight: 42,
    paddingHorizontal: 5,
    paddingVertical: 0
  },
  optionGroup: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18
  },
  optionItem: {
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: 1,
    marginBottom: 16,
    paddingBottom: 16
  },
  optionHeader: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 10
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 11,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18
  },
  dropdownNotice: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  dropdownNoticeText: { color: '#475569', fontSize: 14, fontWeight: '700' },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  buttonDisabled: { backgroundColor: '#94a3b8' },
  buttonPressed: { opacity: 0.78 },
  footer: { color: '#64748b', fontSize: 13, lineHeight: 19, marginTop: 4 }
});
