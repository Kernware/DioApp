import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { OfflineError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { DEMO_MODE, MOBILE_API_URL } from '../config/env';
import { Button, Field, Notice } from '../ui/components';
import { colors } from '../ui/theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen() {
  const { requestCode, verifyCode } = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const describe = (caught: unknown) => {
    if (caught instanceof OfflineError) {
      return `Der Server ist nicht erreichbar:\n${caught.url}\n\nLäuft "npm start" im Ordner server? "localhost" funktioniert nur im iOS-Simulator — am Android-Emulator ist es 10.0.2.2, am echten Gerät die LAN-IP des Rechners.`;
    }

    return caught instanceof Error ? caught.message : 'Etwas ist schiefgelaufen.';
  };

  const submitEmail = async () => {
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Bitte gib eine gültige E-Mail-Adresse ein.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await requestCode(email);
      setStep('code');
    } catch (caught) {
      setError(describe(caught));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (code.trim().length !== 6) {
      setError('Der Code besteht aus 6 Ziffern.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await verifyCode(email, code);
    } catch (caught) {
      setError(describe(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>STERNSINGEN</Text>
          <Text style={styles.title}>
            {step === 'email' ? 'Anmelden' : 'Code eingeben'}
          </Text>
          <Text style={styles.description}>
            {step === 'email'
              ? 'Gib die E-Mail-Adresse ein, mit der dich deine Pfarre eingetragen hat. Du bekommst einen 6-stelligen Code zugeschickt.'
              : `Wir haben einen 6-stelligen Code an ${email.trim()} geschickt. Er ist 10 Minuten gültig.`}
          </Text>

          {DEMO_MODE ? (
            <Notice tone="primary">
              Demo-Modus ohne Server: beliebige E-Mail-Adresse, danach ein beliebiger 6-stelliger
              Code.
            </Notice>
          ) : null}

          {error ? <Notice tone="danger">{error}</Notice> : null}

          {step === 'email' ? (
            <>
              <Field
                label="E-Mail-Adresse"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                inputMode="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                onSubmitEditing={() => void submitEmail()}
                placeholder="name@pfarre.at"
                returnKeyType="send"
                value={email}
              />
              <Button busy={busy} label="Code anfordern" onPress={() => void submitEmail()} />
            </>
          ) : (
            <>
              <Field
                label="6-stelliger Code"
                autoComplete="one-time-code"
                autoFocus
                inputMode="numeric"
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
                onSubmitEditing={() => void submitCode()}
                placeholder="123456"
                returnKeyType="go"
                style={styles.codeInput}
                value={code}
              />
              <Button busy={busy} label="Anmelden" onPress={() => void submitCode()} />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
                style={styles.linkButton}
              >
                <Text style={styles.linkLabel}>Andere E-Mail-Adresse verwenden</Text>
              </Pressable>
            </>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Nur Adressen, die in der Pfarrverwaltung eingetragen sind, können sich anmelden. Du
              bleibst danach den ganzen Tag angemeldet, auch ohne Empfang.
            </Text>
            <Text style={styles.apiHint}>
              {DEMO_MODE ? 'API: Demo-Modus (lokal, kein Server)' : `API: ${MOBILE_API_URL}`}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 22, paddingTop: 40 },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 10
  },
  title: { color: colors.ink, fontSize: 32, fontWeight: '800', marginBottom: 10 },
  description: { color: colors.inkMuted, fontSize: 16, lineHeight: 24, marginBottom: 24 },
  codeInput: { fontSize: 30, fontWeight: '800', letterSpacing: 10, textAlign: 'center' },
  linkButton: { alignItems: 'center', minHeight: 48, justifyContent: 'center', marginTop: 8 },
  linkLabel: { color: colors.primaryInk, fontSize: 15, fontWeight: '700' },
  footer: { marginTop: 'auto', paddingTop: 30 },
  footerText: { color: colors.inkSubtle, fontSize: 13, lineHeight: 20 },
  apiHint: { color: colors.inkFaint, fontSize: 11, marginTop: 10 }
});
