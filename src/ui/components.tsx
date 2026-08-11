import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle
} from 'react-native';
import { colors, touchTarget } from './theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  style
}: ButtonProps) {
  const inactive = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        inactive && styles.buttonInactive,
        pressed && styles.buttonPressed,
        style
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? '#ffffff' : colors.primaryInk} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === 'secondary' && styles.buttonLabelSecondary,
            variant === 'danger' && styles.buttonLabelDanger
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  hint?: string;
};

export function Field({ label, hint, style, ...inputProps }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.inkFaint}
        style={[styles.input, style]}
        {...inputProps}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.buttonPressed
      ]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

type PillTone = 'neutral' | 'success' | 'warning' | 'danger' | 'primary';

const pillTones: Record<PillTone, { background: string; color: string }> = {
  neutral: { background: colors.border, color: colors.inkMuted },
  success: { background: colors.successSoft, color: colors.success },
  warning: { background: colors.warningSoft, color: colors.warning },
  danger: { background: colors.dangerSoft, color: colors.danger },
  primary: { background: colors.primarySoft, color: colors.primaryInk }
};

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: PillTone }) {
  const palette = pillTones[tone];

  return (
    <View style={[styles.pill, { backgroundColor: palette.background }]}>
      <Text style={[styles.pillLabel, { color: palette.color }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Notice({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  const palette = pillTones[tone];

  return (
    <View style={[styles.notice, { backgroundColor: palette.background }]}>
      <Text style={[styles.noticeText, { color: palette.color }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: touchTarget,
    paddingHorizontal: 18
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.primarySoft },
  buttonDanger: { backgroundColor: colors.dangerSoft },
  buttonInactive: { opacity: 0.5 },
  buttonPressed: { opacity: 0.78 },
  buttonLabel: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  buttonLabelSecondary: { color: colors.primaryInk },
  buttonLabelDanger: { color: colors.danger },
  field: { marginBottom: 14 },
  fieldLabel: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 17,
    minHeight: touchTarget,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  fieldHint: { color: colors.inkSubtle, fontSize: 12, marginTop: 6 },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipLabel: { color: colors.inkMuted, fontSize: 15, fontWeight: '700' },
  chipLabelSelected: { color: '#ffffff' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillLabel: { fontSize: 12, fontWeight: '800' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18
  },
  sectionTitle: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: 'uppercase'
  },
  notice: { borderRadius: 12, marginBottom: 14, padding: 14 },
  noticeText: { fontSize: 14, fontWeight: '600', lineHeight: 20 }
});
