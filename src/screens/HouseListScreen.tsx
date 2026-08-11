import { useCallback, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { formatAddress, formatAmount } from '../domain/types';
import type { House, HouseStatus } from '../domain/types';
import type { RootStackParamList } from '../navigation/types';
import { useSync } from '../sync/SyncContext';
import { useTour } from '../tour/TourContext';
import { Button, Notice, Pill } from '../ui/components';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Houses'>;

const STATUS_LABELS: Record<HouseStatus, string> = {
  open: 'Offen',
  in_progress: 'Nochmal',
  done: 'Erledigt',
  skipped: 'Übersprungen'
};

const STATUS_TONES: Record<HouseStatus, 'neutral' | 'primary' | 'success' | 'warning'> = {
  open: 'neutral',
  in_progress: 'warning',
  done: 'success',
  skipped: 'primary'
};

function SyncIndicator() {
  const { online, pending, syncing } = useSync();

  if (syncing) {
    return <Pill label="Synchronisiert…" tone="primary" />;
  }

  if (!online) {
    return <Pill label={pending > 0 ? `Offline · ${pending} offen` : 'Offline'} tone="warning" />;
  }

  if (pending > 0) {
    return <Pill label={`${pending} zu senden`} tone="warning" />;
  }

  return <Pill label="Alles gesendet" tone="success" />;
}

export function HouseListScreen({ navigation }: Props) {
  const { assignment, houses, totals, loading, error, refresh } = useTour();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const renderHouse = ({ item }: { item: House }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => navigation.navigate('Visit', { houseId: item.id })}
      style={({ pressed }) => [styles.houseRow, pressed && styles.housePressed]}
    >
      <View style={styles.houseMain}>
        <Text style={styles.houseAddress}>{formatAddress(item)}</Text>
        {item.contactName ? <Text style={styles.houseMeta}>{item.contactName}</Text> : null}
        {item.note ? (
          <Text numberOfLines={2} style={styles.houseNote}>
            {item.note}
          </Text>
        ) : null}
      </View>
      <Pill label={STATUS_LABELS[item.status]} tone={STATUS_TONES[item.status]} />
    </Pressable>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        contentContainerStyle={styles.content}
        data={houses}
        keyExtractor={(item) => item.id}
        onRefresh={() => void onRefresh()}
        refreshing={refreshing}
        renderItem={renderHouse}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>{assignment?.shiftName ?? 'Keine Schicht'}</Text>
                <Text style={styles.title}>{assignment?.groupName ?? 'Keine Gruppe'}</Text>
              </View>
              <SyncIndicator />
            </View>

            <View style={styles.progressCard}>
              <View style={styles.progressItem}>
                <Text style={styles.progressValue}>
                  {totals.housesDone}/{totals.housesTotal}
                </Text>
                <Text style={styles.progressLabel}>Häuser</Text>
              </View>
              <View style={styles.progressDivider} />
              <View style={styles.progressItem}>
                <Text style={styles.progressValue}>{formatAmount(totals.amountCents)}</Text>
                <Text style={styles.progressLabel}>Gesammelt</Text>
              </View>
              <View style={styles.progressDivider} />
              <View style={styles.progressItem}>
                <Text style={styles.progressValue}>{totals.donationCount}</Text>
                <Text style={styles.progressLabel}>Spenden</Text>
              </View>
            </View>

            {error ? <Notice tone="warning">{error}</Notice> : null}
          </View>
        }
        ListEmptyComponent={
          <Notice tone="neutral">
            Noch keine Adressen geladen. Zieh die Liste nach unten, um sie erneut abzurufen.
          </Notice>
        }
      />

      <View style={styles.footer}>
        <Button label="Tour abschließen" onPress={() => navigation.navigate('Summary')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 },
  centered: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center'
  },
  content: { padding: 18, paddingBottom: 28 },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  headerText: { flex: 1, paddingRight: 12 },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800' },
  progressCard: {
    backgroundColor: colors.ink,
    borderRadius: 16,
    flexDirection: 'row',
    marginBottom: 16,
    padding: 18
  },
  progressItem: { alignItems: 'center', flex: 1 },
  progressValue: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  progressLabel: { color: '#cbd5e1', fontSize: 12, marginTop: 4 },
  progressDivider: { backgroundColor: '#334155', width: 1 },
  houseRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    minHeight: 74,
    padding: 16
  },
  housePressed: { opacity: 0.78 },
  houseMain: { flex: 1, paddingRight: 12 },
  houseAddress: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  houseMeta: { color: colors.inkSubtle, fontSize: 13, marginTop: 3 },
  houseNote: { color: colors.inkFaint, fontSize: 12, marginTop: 5 },
  footer: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    padding: 18
  }
});
