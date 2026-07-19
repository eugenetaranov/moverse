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
import * as Clipboard from "expo-clipboard";
import { printer } from "./niimbot/connection";
import { makeTestImage } from "./niimbot/testImage";
import {
  DEFAULT_LABEL,
  DEFAULT_TUNING,
  LABEL_TYPES,
  LabelSize,
  PrintTuning,
  fitsQr,
  labelPx,
  loadLabelSize,
  loadTuning,
  saveLabelSize,
  saveTuning,
} from "./labelSettings";
import { LabelingMode, loadMode, saveMode } from "./labelingMode";
import { colors, radius, space, type as t, HIT } from "./theme";
import { Button, Segmented, SelectableCard, SectionHeader, TextField, SCREEN, type IconName } from "./ui";

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

export default function Settings() {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [, force] = useState(0);
  const [mode, setMode] = useState<LabelingMode>("assign");
  const [label, setLabel] = useState<LabelSize>(DEFAULT_LABEL);
  const [tuning, setTuning] = useState<PrintTuning>(DEFAULT_TUNING);
  const log = (s: string) => setLines((l) => [...l.slice(-80), s]);

  useEffect(() => {
    loadMode().then(setMode);
    loadLabelSize().then(setLabel);
    loadTuning().then(setTuning);
    printer.log = log;
    return printer.subscribe(() => force((n) => n + 1));
  }, []);

  function updateTuning(patch: Partial<PrintTuning>) {
    setTuning((prev) => {
      const next = { ...prev, ...patch };
      void saveTuning(next);
      return next;
    });
  }

  function pickMode(m: LabelingMode) {
    setMode(m);
    void saveMode(m);
    // Printing only applies to "assign" — drop any printer link otherwise.
    if (m !== "assign" && printer.connected) {
      void printer.disconnect();
      log("printer disconnected (not used in this mode)");
    }
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
    setPrinting(true);
    try {
      const { widthPx, heightPx } = labelPx(label);
      log(`printing test ${widthPx}x${heightPx} (d${tuning.density}, type ${tuning.labelType})…`);
      await printer.client.printImage(makeTestImage(widthPx, heightPx), tuning.density, tuning.labelType);
      log("print done");
    } catch (e) {
      log(`print stopped: ${String((e as Error)?.message ?? e)}`);
    } finally {
      setPrinting(false);
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
    setPrinting(false);
  }

  async function copyLog() {
    await Clipboard.setStringAsync(lines.join("\n"));
    log("(log copied to clipboard)");
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingHorizontal: SCREEN.padH, paddingTop: space.md, paddingBottom: SCREEN.padBottom }}
    >
      {/* Labeling mode */}
      <SectionHeader>How do you label items?</SectionHeader>
      {MODES.map((m) => {
        const on = mode === m.key;
        return (
          <SelectableCard
            key={m.key}
            icon={m.icon}
            title={m.title}
            subtitle={m.sub}
            selected={on}
            onPress={() => pickMode(m.key)}
            trailing={
              <Ionicons
                name={on ? "checkmark-circle" : "ellipse-outline"}
                size={22}
                color={on ? colors.accent : colors.border}
              />
            }
          />
        );
      })}

      {mode !== "assign" ? (
        <Text style={[styles.hint, { marginTop: space.lg }]}>
          Printer and label options appear when “App assigns codes” is selected.
        </Text>
      ) : (
        <>
      {/* Printer */}
      <SectionHeader>Printer (NIIMBOT B1)</SectionHeader>
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
          <Button title="Disconnect" onPress={disconnect} disabled={busy || printing} style={styles.flexBtn} />
        ) : (
          <Button title="Connect" icon="bluetooth" tone="accent" onPress={connect} disabled={busy} style={styles.flexBtn} />
        )}
        {printing ? (
          <Button title="Cancel print" icon="close" tone="danger" onPress={cancelPrint} style={styles.flexBtn} />
        ) : (
          <Button
            title="Print test"
            icon="print-outline"
            onPress={printTest}
            disabled={!printer.connected || busy}
            style={styles.flexBtn}
          />
        )}
      </View>

      {/* Label size */}
      <SectionHeader>Label size (mm)</SectionHeader>
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

      {/* Print tuning */}
      <SectionHeader>Print tuning</SectionHeader>
      <View style={styles.tuneBlock}>
        <Text style={styles.tuneLabel}>Density</Text>
        <Segmented
          options={[1, 2, 3, 4, 5].map((d) => ({ value: String(d), label: String(d) }))}
          value={String(tuning.density)}
          onChange={(v) => updateTuning({ density: Number(v) })}
        />
      </View>
      <View style={styles.tuneBlock}>
        <Text style={styles.tuneLabel}>Label type</Text>
        <Segmented
          options={LABEL_TYPES.map((lt) => ({ value: String(lt.v), label: lt.label }))}
          value={String(tuning.labelType)}
          onChange={(v) => updateTuning({ labelType: Number(v) })}
        />
      </View>

      {/* Log */}
      <View style={styles.logHeader}>
        <SectionHeader>Log</SectionHeader>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={copyLog}
          disabled={lines.length === 0}
          hitSlop={8}
          accessibilityLabel="Copy log"
        >
          <Ionicons name="copy-outline" size={16} color={colors.accent} />
          <Text style={styles.copyText}>Copy</Text>
        </TouchableOpacity>
      </View>
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
        </>
      )}
    </ScrollView>
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
      <TextField
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
  stateRow: { flexDirection: "row", alignItems: "center", marginBottom: space.md },
  state: { ...t.bodyStrong, color: colors.fg, marginLeft: space.sm },
  row: { flexDirection: "row", gap: space.md },
  flexBtn: { flex: 1 },
  hint: { ...t.caption, color: colors.mutedFg, marginBottom: space.md },
  field: { flex: 1 },
  fieldLabel: { ...t.caption, color: colors.mutedFg, marginBottom: space.xs },
  formatRow: { flexDirection: "row", alignItems: "center", marginTop: space.md },
  format: { ...t.bodyStrong, color: colors.accent, marginLeft: space.sm },
  tuneBlock: { marginBottom: space.md },
  tuneLabel: { ...t.caption, color: colors.mutedFg, marginBottom: space.xs },
  logHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  copyBtn: { flexDirection: "row", alignItems: "center", marginBottom: space.sm },
  copyText: { color: colors.accent, fontWeight: "700", fontSize: 13, marginLeft: 4 },
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
