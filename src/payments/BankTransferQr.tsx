import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { BANK_QR_REFERENCE, DEMO_MODE } from '../config/env';
import { formatAmount } from '../domain/types';
import { Button, Notice } from '../ui/components';
import { colors } from '../ui/theme';
import { buildSepaQrPayload } from './sepaQr';

type BankTransferQrProps = {
  amountCents: number;
};

export function BankTransferQr({ amountCents }: BankTransferQrProps) {
  const [visible, setVisible] = useState(false);
  const payload = useMemo(() => buildSepaQrPayload(amountCents), [amountCents]);
  const previewPayload = useMemo(
    () =>
      payload ??
      (DEMO_MODE && amountCents > 0 ? `DIO-PAYMENTS-DEMO\nEUR${(amountCents / 100).toFixed(2)}` : null),
    [amountCents, payload]
  );

  useEffect(() => {
    setVisible(false);
  }, [amountCents]);

  if (amountCents <= 0) {
    return (
      <View style={styles.container}>
        <Notice tone="neutral">Wähle zuerst einen Betrag, dann entsteht der QR-Code dazu.</Notice>
      </View>
    );
  }

  if (!previewPayload) {
    return (
      <View style={styles.container}>
        <Notice tone="warning">
          Kein Konto konfiguriert. Ohne IBAN und Empfängername in der App-Umgebung lässt sich kein
          QR-Code erzeugen.
        </Notice>
      </View>
    );
  }

  const isPreviewOnly = !payload;

  return (
    <View style={styles.container}>
      <Button
        label={visible ? 'QR-Code ausblenden' : 'QR-Code erstellen'}
        onPress={() => setVisible((shown) => !shown)}
      />
      {visible ? (
        <View style={styles.qr}>
          <QRCode
            backgroundColor={colors.surface}
            color={colors.ink}
            size={190}
            value={previewPayload}
          />
          <Text style={styles.amount}>{formatAmount(amountCents)}</Text>
          <Text style={styles.reference}>
            {isPreviewOnly ? 'Mit Unterstützer Bankapp scannen' : BANK_QR_REFERENCE}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 4 },
  qr: { alignItems: 'center', paddingTop: 16 },
  amount: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 12 },
  reference: { color: colors.inkSubtle, fontSize: 12, marginTop: 3 }
});
