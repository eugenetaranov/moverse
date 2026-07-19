// Shared UI primitives and layout conventions — one source of truth so every
// screen (Pack, Settings, Browse) renders the same buttons, inputs, cards,
// headers, spacing, and title treatment. Styling comes from ./theme tokens.
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { colors, radius, space, type as t, HIT } from "./theme";

export type IconName = keyof typeof Ionicons.glyphMap;

// ---- layout / spacing conventions ----

// One horizontal content inset and bottom clearance for every screen. Screens
// reference these instead of per-screen literal paddings.
export const SCREEN = { padH: space.lg, padBottom: space.xxl } as const;

// Shared native-stack header style so Pack, Settings, and Browse all present the
// same compact, left-aligned title and chrome.
export const stackScreenOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.fg,
  headerTitleStyle: { fontSize: 20, fontWeight: "700" },
  headerTitleAlign: "left",
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
};

// Padded body container for non-list screens (adds the standard horizontal inset
// and a bottom inset that clears the tab bar / gesture area).
export function Screen({ children, style }: { children: React.ReactNode; style?: object }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        { flex: 1, backgroundColor: colors.bg, paddingHorizontal: SCREEN.padH, paddingBottom: insets.bottom },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Center({ children }: { children: React.ReactNode }) {
  return <View style={styles.center}>{children}</View>;
}

// ---- buttons ----

// The one button. `tone` colors a solid button; `variant: "muted"` is the old
// secondary look. One height + typography everywhere.
export function Button({
  title,
  onPress,
  icon,
  tone = "primary",
  variant = "solid",
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  tone?: "primary" | "accent" | "danger";
  variant?: "solid" | "muted";
  disabled?: boolean;
  style?: object;
}) {
  const solid = variant === "solid";
  const bg = !solid
    ? colors.muted
    : tone === "accent"
      ? colors.accent
      : tone === "danger"
        ? colors.destructive
        : colors.primary;
  const fg = solid ? colors.onPrimary : colors.fg;
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: bg }, disabled && styles.btnDisabled, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {icon ? <Ionicons name={icon} size={18} color={fg} style={{ marginRight: 6 }} /> : null}
      <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
    </TouchableOpacity>
  );
}

// Thin wrappers kept so existing call sites don't churn.
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
    <Button
      title={title}
      onPress={onPress}
      disabled={disabled}
      style={style}
      icon={icon}
      tone={accent ? "accent" : "primary"}
      variant="solid"
    />
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
  return <Button title={title} onPress={onPress} disabled={disabled} style={style} icon={icon} variant="muted" />;
}

// ---- inputs / labels ----

export function TextField({ invalid, style, multiline, ...rest }: TextInputProps & { invalid?: boolean }) {
  return (
    <TextInput
      style={[styles.input, multiline && styles.inputMultiline, invalid && styles.inputInvalid, style]}
      placeholderTextColor={colors.mutedFg}
      multiline={multiline}
      {...rest}
    />
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

// Uppercase section title used to group content on a screen.
export function SectionHeader({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionHeader}>{children}</Text>;
}

// ---- cards ----

// Icon + title + subtitle + trailing card, for selectable lists (Settings modes,
// onboarding choices). Pass `trailing` for the trailing affordance.
export function SelectableCard({
  icon,
  title,
  subtitle,
  selected = false,
  onPress,
  trailing,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  selected?: boolean;
  onPress: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={[styles.selCard, selected && styles.selCardOn]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
    >
      <View style={[styles.selIcon, selected && styles.selIconOn]}>
        <Ionicons name={icon} size={22} color={selected ? colors.onPrimary : colors.primary} />
      </View>
      <View style={{ flex: 1, marginLeft: space.md }}>
        <Text style={styles.selTitle}>{title}</Text>
        {subtitle ? <Text style={styles.selSub}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </TouchableOpacity>
  );
}

// Generic tappable row card (leading icon + free content + chevron), e.g. the
// browse box rows.
export function RowCard({
  leadingIcon,
  children,
  onPress,
  accessibilityLabel,
}: {
  leadingIcon?: IconName;
  children: React.ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      style={styles.rowCard}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {leadingIcon ? (
        <View style={styles.rowIcon}>
          <Ionicons name={leadingIcon} size={22} color={colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1, marginLeft: leadingIcon ? space.md : 0 }}>{children}</View>
      <Ionicons name="chevron-forward" size={20} color={colors.mutedFg} />
    </TouchableOpacity>
  );
}

// A small pill. `tone` tints it for destinations/status; default is neutral.
export function Badge({
  label,
  icon,
  tone = "neutral",
}: {
  label: string;
  icon?: IconName;
  tone?: "neutral" | "accent" | "primary";
}) {
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
    <Wrapper style={styles.chip} onPress={onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={label}>
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
  // buttons — one size + typography
  btn: {
    flexDirection: "row",
    minHeight: 52,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { fontSize: 16, fontWeight: "700" },
  btnDisabled: { opacity: 0.4 },
  // inputs
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: HIT,
    fontSize: 16,
    color: colors.fg,
    backgroundColor: colors.surface,
  },
  inputMultiline: { minHeight: 88, paddingTop: space.md, paddingBottom: space.md, textAlignVertical: "top" },
  inputInvalid: { borderColor: colors.warning, backgroundColor: "#FFFBEB" },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", marginTop: space.lg, marginBottom: space.sm },
  fieldLabel: { ...t.label, color: colors.mutedFg },
  sectionHeader: { ...t.label, color: colors.mutedFg, marginTop: space.xl, marginBottom: space.sm },
  // selectable card
  selCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
  },
  selCardOn: { borderColor: colors.primary, backgroundColor: "#F1F5F9" },
  selIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  selIconOn: { backgroundColor: colors.primary },
  selTitle: { ...t.bodyStrong, color: colors.fg },
  selSub: { ...t.caption, color: colors.mutedFg, marginTop: 2 },
  // row card
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  // badge
  badge: { flexDirection: "row", alignItems: "center", borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  badgeNeutral: { backgroundColor: colors.muted },
  badgeAccent: { backgroundColor: colors.accent },
  badgePrimary: { backgroundColor: colors.primary },
  badgeText: { fontSize: 12, fontWeight: "700" },
  // chip
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
  // segmented
  segment: { flexDirection: "row", backgroundColor: colors.muted, borderRadius: radius.md, padding: 3 },
  segmentItem: { flex: 1, minHeight: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  segmentItemActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 15, fontWeight: "600", color: colors.mutedFg },
  segmentTextActive: { color: colors.fg },
  // states
  stateTitle: { ...t.title, color: colors.fg, textAlign: "center", marginTop: space.md },
  stateSub: { ...t.caption, color: colors.mutedFg, textAlign: "center", marginTop: space.xs },
});
