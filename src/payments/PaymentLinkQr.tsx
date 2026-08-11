import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { formatAmount } from '../domain/types';
import { Button, Notice } from '../ui/components';
import { colors } from '../ui/theme';
import {
  createPaymentLink,
  fetchPaymentLinkStatus,
  staticPaymentLink,
  type PaymentLink,
  type PaymentLinkStatus
} from './paymentLink';

const STATUS_POLL_MS = 4000;

type PaymentLinkQrProps = {
  amountCents: number;
};

export function PaymentLinkQr({ amountCents }: PaymentLinkQrProps) {
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [status, setStatus] = useState<PaymentLinkStatus>('open');
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const selectedAmount = useRef(amountCents);

  // A link carries the amount it was created with, so a changed amount voids it.
  useEffect(() => {
    selectedAmount.current = amountCents;
    setLink(null);
    setStatus('open');
    setVisible(false);
    setError(null);
    setWarning(null);
  }, [amountCents]);

  const sessionId = link?.id ?? null;

  useEffect(() => {
    if (!sessionId || status !== 'open') {
      return;
    }

    let cancelled = false;
    const timer = setInterval(() => {
      void fetchPaymentLinkStatus(sessionId)
        .then((next) => {
          if (!cancelled) {
            setStatus(next);
          }
        })
        .catch(() => undefined);
    }, STATUS_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId, status]);

  const create = async () => {
    const forAmount = amountCents;

    setBusy(true);
    setVisible(false);
    setError(null);
    setWarning(null);
    setStatus('open');

    try {
      const created = await createPaymentLink(forAmount);

      // The volunteer corrected the amount while the request was in flight.
      if (selectedAmount.current === forAmount) {
        setLink(created);
        setVisible(true);
      }
    } catch (caught) {
      if (selectedAmount.current !== forAmount) {
        return;
      }

      const message =
        caught instanceof Error ? caught.message : 'Der Link konnte nicht erstellt werden.';
      const fallback = staticPaymentLink();

      if (!fallback) {
        setError(message);
        return;
      }

      setLink(fallback);
      setVisible(true);
      setWarning(message);
    } finally {
      setBusy(false);
    }
  };

  if (amountCents <= 0) {
    return (
      <View style={styles.container}>
        <Notice tone="neutral">Wähle zuerst einen Betrag, dann entsteht der Zahlungslink dazu.</Notice>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {warning ? <Notice tone="warning">{warning}</Notice> : null}

      {link ? (
        <>
          {status === 'paid' ? (
            <Notice tone="success">
              Zahlung über {formatAmount(amountCents)} bestätigt. Als Zahlungsart bleibt „Karte“
              richtig — jetzt unten speichern.
            </Notice>
          ) : null}
          {status === 'expired' ? (
            <Notice tone="warning">
              Der Link ist abgelaufen. Erstelle einen neuen, falls noch nicht gezahlt wurde.
            </Notice>
          ) : null}

          {status === 'open' ? (
            <Button
              label={visible ? 'QR-Code ausblenden' : 'QR-Code anzeigen'}
              onPress={() => setVisible((shown) => !shown)}
            />
          ) : null}

          {status === 'open' && visible ? (
            <View style={styles.qr}>
              <QRCode
                backgroundColor={colors.surface}
                color={colors.ink}
                size={190}
                value={link.url}
              />
              <Text style={styles.amount}>{formatAmount(amountCents)}</Text>
              <Text style={styles.reference}>Scannen und am Unterstützer-Handy bezahlen.</Text>
            </View>
          ) : null}

          {status === 'expired' ? (
            <Button
              busy={busy}
              label="QR-Code erstellen"
              onPress={() => void create()}
              style={styles.buttonGap}
            />
          ) : null}
        </>
      ) : (
        <Button
          busy={busy}
          label="QR-Code erstellen"
          onPress={() => void create()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 10 },
  qr: { alignItems: 'center', paddingTop: 4 },
  amount: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 12 },
  reference: { color: colors.inkSubtle, fontSize: 12, marginTop: 3 },
  buttonGap: { marginTop: 10 }
});
