// Shared UI primitives, lifted out of App.tsx so the Pack hub and the Browse
// screens render from one source of truth. Styling matches the design tokens in
// ./theme so every surface stays visually consistent.
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, space, type as t, HIT } from "./theme";

export type IconName = keyof typeof Ionicons.glyphMap;

export function Center({ children }: { children: React.ReactNode }) {
  return <View style={styles.center}>{children}</View>;
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  style,
  icon,
  accent,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: object;
  icon?: IconName;
  accent?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, accent && styles.accentBtn, disabled && styles.btnDisabled, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {icon ? <Ionicons name={icon} size={20} color={colors.onPrimary} style={{ marginRight: 8 }} /> : null}
      <Text style={styles.primaryBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

export function SecondaryButton({
  title,
  onPress,
  disabled,
  style,
  icon,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: object;
  icon?: IconName;
}) {
  return (
    <TouchableOpacity
      style={[styles.secondaryBtn, disabled && styles.btnDisabled, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {icon ? <Ionicons name={icon} size={18} color={colors.fg} style={{ marginRight: 6 }} /> : null}
      <Text style={styles.secondaryBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

export function FieldLabel({ text, done }: { text: string; done?: boolean }) {
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={styles.fieldLabel}>{text}</Text>
      {done ? (
        <Ionicons name="checkmark-circle" size={16} color={colors.accent} style={{ marginLeft: 6 }} />
      ) : null}
    </View>
  );
}

// A small pill. `tone` tints it for destinations/status; default is neutral.
export function Badge({ label, icon, tone = "neutral" }: { label: string; icon?: IconName; tone?: "neutral" | "accent" | "primary" }) {
  const toneStyle =
    tone === "accent" ? styles.badgeAccent : tone === "primary" ? styles.badgePrimary : styles.badgeNeutral;
  const fg = tone === "neutral" ? colors.mutedFg : colors.onPrimary;
  return (
    <View style={[styles.badge, toneStyle]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} style={{ marginRight: 4 }} /> : null}
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// Tappable chip used for box membership on item cards / detail.
export function Chip({ label, icon, onPress }: { label: string; icon?: IconName; onPress?: () => void }) {
  const Wrapper: typeof TouchableOpacity | typeof View = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      style={styles.chip}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={label}
    >
      {icon ? <Ionicons name={icon} size={13} color={colors.fg} style={{ marginRight: 4 }} /> : null}
      <Text style={styles.chipText}>{label}</Text>
    </Wrapper>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <Center>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.stateSub}>{label}</Text>
    </Center>
  );
}

export function EmptyState({
  icon = "cube-outline",
  title,
  subtitle,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
}) {
  return (
    <Center>
      <Ionicons name={icon} size={44} color={colors.mutedFg} />
      <Text style={styles.stateTitle}>{title}</Text>
      {subtitle ? <Text style={styles.stateSub}>{subtitle}</Text> : null}
    </Center>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Center>
      <Ionicons name="alert-circle-outline" size={44} color={colors.destructive} />
      <Text style={styles.stateTitle}>Couldn't load</Text>
      <Text style={styles.stateSub}>{message}</Text>
      <View style={{ height: space.lg }} />
      <SecondaryButton title="Retry" icon="refresh" onPress={onRetry} />
    </Center>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, backgroundColor: colors.bg },
  primaryBtn: {
    flexDirection: "row",
    backgroundColor: colors.primary,
    minHeight: 56,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  accentBtn: { backgroundColor: colors.accent },
  primaryBtnText: { color: colors.onPrimary, fontSize: 17, fontWeight: "700" },
  secondaryBtn: {
    flexDirection: "row",
    backgroundColor: colors.muted,
    minHeight: HIT,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: colors.fg, fontSize: 15, fontWeight: "600" },
  btnDisabled: { opacity: 0.4 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", marginTop: space.lg, marginBottom: space.sm },
  fieldLabel: { ...t.label, color: colors.mutedFg },
  badge: { flexDirection: "row", alignItems: "center", borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  badgeNeutral: { backgroundColor: colors.muted },
  badgeAccent: { backgroundColor: colors.accent },
  badgePrimary: { backgroundColor: colors.primary },
  badgeText: { fontSize: 12, fontWeight: "700" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.muted,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.fg },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentItemActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 15, fontWeight: "600", color: colors.mutedFg },
  segmentTextActive: { color: colors.fg },
  stateTitle: { ...t.title, color: colors.fg, textAlign: "center", marginTop: space.md },
  stateSub: { ...t.caption, color: colors.mutedFg, textAlign: "center", marginTop: space.xs },
});
