import React, { useEffect, useRef, useState } from "react";
import {
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { printer } from "./niimbot/connection";
import { makeTestImage } from "./niimbot/testImage";
import {
  DEFAULT_LABEL,
  LabelSize,
  fitsQr,
  labelPx,
  loadLabelSize,
  saveLabelSize,
} from "./labelSettings";
import { LabelingMode, loadMode, saveMode } from "./labelingMode";
import { colors, radius, space, type as t, HIT } from "./theme";

type IconName = keyof typeof Ionicons.glyphMap;

async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const perms: string[] = [];
  if (Platform.Version >= 31) {
    perms.push(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    );
  } else {
    perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  }
  const res = await PermissionsAndroid.requestMultiple(perms as any);
  return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
}

const MODES: { key: LabelingMode; icon: IconName; title: string; sub: string }[] = [
  { key: "scan", icon: "qr-code-outline", title: "Scan pre-made labels", sub: "Printed sheets / rolls — scan each" },
  { key: "assign", icon: "print-outline", title: "App assigns codes", sub: "Print or hand-write the next code" },
  { key: "none", icon: "camera-outline", title: "No codes", sub: "Just name a box, photograph items" },
];

export default function Settings({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);
  const [mode, setMode] = useState<LabelingMode>("assign");
  const [label, setLabel] = useState<LabelSize>(DEFAULT_LABEL);
  const log = (s: string) => setLines((l) => [...l.slice(-80), s]);

  useEffect(() => {
    loadMode().then(setMode);
    loadLabelSize().then(setLabel);
    printer.log = log;
    return printer.subscribe(() => force((n) => n + 1));
  }, []);

  function pickMode(m: LabelingMode) {
    setMode(m);
    void saveMode(m);
  }
  function updateLabel(patch: Partial<LabelSize>) {
    setLabel((prev) => {
      const next = { ...prev, ...patch };
      void saveLabelSize(next);
      return next;
    });
  }

  async function connect() {
    setBusy(true);
    try {
      if (!(await requestBlePermissions())) {
        log("permissions denied");
        return;
      }
      log("scanning for printer…");
      await printer.connect("b1");
      log(`connected: ${printer.name}`);
    } catch (e) {
      log(`connect failed: ${String((e as Error)?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    try {
      await printer.disconnect();
      log("disconnected");
    } finally {
      setBusy(false);
    }
  }
  async function printTest() {
    if (!printer.client) return;
    setBusy(true);
    try {
      const { widthPx, heightPx } = labelPx(label);
      log(`printing test ${widthPx}x${heightPx}…`);
      await printer.client.printImage(makeTestImage(widthPx, heightPx), 3, 1);
      log("print done");
    } catch (e) {
      log(`print stopped: ${String((e as Error)?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }
  async function cancelPrint() {
    printer.client?.cancel();
    log("cancelling…");
    try {
      await printer.disconnect();
    } catch {
      // ignore
    }
    setBusy(false);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: space.lg, paddingTop: 56 }}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Settings</Text>
        <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Done">
          <Text style={styles.close}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* Labeling mode */}
      <Text style={styles.section}>How do you label items?</Text>
      {MODES.map((m) => {
        const on = mode === m.key;
        return (
          <TouchableOpacity
            key={m.key}
            style={[styles.modeCard, on && styles.modeCardOn]}
            onPress={() => pickMode(m.key)}
            activeOpacity={0.85}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <View style={[styles.modeIcon, on && styles.modeIconOn]}>
              <Ionicons name={m.icon} size={22} color={on ? colors.onPrimary : colors.mutedFg} />
            </View>
            <View style={{ marginLeft: space.md, flex: 1 }}>
              <Text style={styles.modeTitle}>{m.title}</Text>
              <Text style={styles.modeSub}>{m.sub}</Text>
            </View>
            <Ionicons
              name={on ? "checkmark-circle" : "ellipse-outline"}
              size={22}
              color={on ? colors.accent : colors.border}
            />
          </TouchableOpacity>
        );
      })}

      {/* Printer */}
      <Text style={styles.section}>Printer (NIIMBOT B1)</Text>
      <View style={styles.stateRow}>
        <Ionicons
          name={printer.connected ? "bluetooth" : "bluetooth-outline"}
          size={18}
          color={printer.connected ? colors.accent : colors.mutedFg}
        />
        <Text style={styles.state}>
          {printer.connected ? `Connected: ${printer.name}` : "Not connected"}
        </Text>
      </View>
      <View style={styles.row}>
        {printer.connected ? (
          <Btn title="Disconnect" onPress={disconnect} disabled={busy} />
        ) : (
          <Btn title="Connect" icon="bluetooth" tone="accent" onPress={connect} disabled={busy} />
        )}
        <Btn title="Print test" icon="print-outline" onPress={printTest} disabled={busy || !printer.connected} />
      </View>
      {busy ? (
        <View style={[styles.row, { marginTop: space.sm }]}>
          <Btn title="Cancel" tone="danger" onPress={cancelPrint} />
        </View>
      ) : null}

      {/* Label size */}
      <Text style={styles.section}>Label size (mm)</Text>
      <Text style={styles.hint}>Determines whether labels print as QR + text or text-only.</Text>
      <View style={styles.row}>
        <Field label="Width" value={label.widthMm} onChange={(n) => updateLabel({ widthMm: n })} />
        <Field label="Height" value={label.heightMm} onChange={(n) => updateLabel({ heightMm: n })} />
      </View>
      <View style={styles.formatRow}>
        <Ionicons
          name={fitsQr(label) ? "qr-code-outline" : "text-outline"}
          size={16}
          color={colors.accent}
        />
        <Text style={styles.format}>{fitsQr(label) ? "QR code + text" : "Text only"}</Text>
      </View>

      {/* Log */}
      <Text style={styles.section}>Log</Text>
      <View style={styles.logBox}>
        {lines.length === 0 ? (
          <Text style={styles.logHint}>Connect, then Print test. Watch this log.</Text>
        ) : (
          lines.map((l, i) => (
            <Text key={i} style={styles.logLine}>
              {l}
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Btn({
  title,
  onPress,
  disabled,
  icon,
  tone = "primary",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: IconName;
  tone?: "primary" | "accent" | "danger";
}) {
  const bg = tone === "accent" ? colors.accent : tone === "danger" ? colors.destructive : colors.primary;
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: bg }, disabled && { opacity: 0.4 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {icon ? <Ionicons name={icon} size={18} color={colors.onPrimary} style={{ marginRight: 6 }} /> : null}
      <Text style={styles.btnText}>{title}</Text>
    </TouchableOpacity>
  );
}

// Free-edit numeric field: local string so the value can be cleared/retyped;
// commits a clamped number on blur.
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(String(value));
  }, [value]);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={text}
        onFocus={() => (editing.current = true)}
        onChangeText={(v) => setText(v.replace(/[^0-9]/g, ""))}
        onBlur={() => {
          editing.current = false;
          const n = Math.min(120, Math.max(5, parseInt(text || "0", 10) || 0));
          onChange(n);
          setText(String(n));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  title: { ...t.display, color: colors.fg },
  close: { fontSize: 16, fontWeight: "700", color: colors.accent },
  section: { ...t.label, color: colors.mutedFg, marginTop: space.xl, marginBottom: space.sm },
  modeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
  },
  modeCardOn: { borderColor: colors.primary, backgroundColor: "#F1F5F9" },
  modeIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  modeIconOn: { backgroundColor: colors.primary },
  modeTitle: { ...t.bodyStrong, color: colors.fg },
  modeSub: { ...t.caption, color: colors.mutedFg, marginTop: 2 },
  stateRow: { flexDirection: "row", alignItems: "center", marginBottom: space.md },
  state: { ...t.bodyStrong, color: colors.fg, marginLeft: space.sm },
  row: { flexDirection: "row", gap: space.md },
  btn: {
    flex: 1,
    flexDirection: "row",
    minHeight: HIT,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: colors.onPrimary, fontSize: 15, fontWeight: "700" },
  hint: { ...t.caption, color: colors.mutedFg, marginBottom: space.md },
  field: { flex: 1 },
  fieldLabel: { ...t.caption, color: colors.mutedFg, marginBottom: space.xs },
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
  formatRow: { flexDirection: "row", alignItems: "center", marginTop: space.md },
  format: { ...t.bodyStrong, color: colors.accent, marginLeft: space.sm },
  logBox: {
    minHeight: 140,
    backgroundColor: "#0F172A",
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.xxl,
  },
  logHint: { color: "#94A3B8" },
  logLine: { color: "#BAE6FD", fontFamily: "monospace", fontSize: 12, marginBottom: 2 },
});
