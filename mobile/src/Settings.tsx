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

const MODES: { key: LabelingMode; title: string; sub: string }[] = [
  { key: "scan", title: "Scan pre-made labels", sub: "Printed sheets / rolls — scan each" },
  { key: "assign", title: "App assigns codes", sub: "Print or hand-write the next code" },
  { key: "none", title: "No codes", sub: "Just name a box, photograph items" },
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
    } catch (e) {
      log(`print failed: ${String((e as Error)?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }

  const assign = mode === "assign";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingTop: 56 }}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Settings</Text>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
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
            activeOpacity={0.8}
          >
            <Ionicons
              name={on ? "radio-button-on" : "radio-button-off"}
              size={22}
              color={on ? "#111" : "#999"}
            />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.modeTitle}>{m.title}</Text>
              <Text style={styles.modeSub}>{m.sub}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Printer — relevant to the assign branch */}
      <Text style={styles.section}>Printer (NIIMBOT B1)</Text>
      <Text style={styles.state}>
        {printer.connected ? `● Connected: ${printer.name}` : "○ Not connected"}
      </Text>
      {!assign ? (
        <Text style={styles.hint}>
          Used when “App assigns codes” is selected — connect to print a label per item.
        </Text>
      ) : null}
      <View style={styles.row}>
        {printer.connected ? (
          <Btn title="Disconnect" onPress={disconnect} disabled={busy} />
        ) : (
          <Btn title="Connect" onPress={connect} disabled={busy} />
        )}
        <Btn title="Print test label" onPress={printTest} disabled={busy || !printer.connected} />
      </View>

      {/* Label size */}
      <Text style={styles.section}>Label size (mm)</Text>
      <Text style={styles.hint}>Determines whether labels print as QR + text or text-only.</Text>
      <View style={styles.row}>
        <Field label="Width" value={label.widthMm} onChange={(n) => updateLabel({ widthMm: n })} />
        <Field label="Height" value={label.heightMm} onChange={(n) => updateLabel({ heightMm: n })} />
      </View>
      <Text style={styles.format}>Format: {fitsQr(label) ? "QR code + text" : "text only"}</Text>

      {/* Log */}
      <Text style={styles.section}>Log</Text>
      <View style={styles.logBox}>
        {lines.length === 0 ? (
          <Text style={styles.logHint}>Connect, then Print test label. Watch this log.</Text>
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

function Btn({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.btn, disabled && { opacity: 0.4 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.btnText}>{title}</Text>
    </TouchableOpacity>
  );
}

// Free-edit numeric field: keeps a local string so the value can be cleared and
// retyped; commits a clamped number on blur.
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
        onChangeText={(t) => setText(t.replace(/[^0-9]/g, ""))}
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
  screen: { flex: 1, backgroundColor: "#fff" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: { fontSize: 24, fontWeight: "800" },
  close: { fontSize: 16, fontWeight: "700", color: "#111" },
  section: {
    fontSize: 13,
    fontWeight: "700",
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 22,
    marginBottom: 8,
  },
  modeCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  modeCardOn: { borderColor: "#111", backgroundColor: "#f5f5f5" },
  modeTitle: { fontSize: 15, fontWeight: "700", color: "#111" },
  modeSub: { fontSize: 13, color: "#666", marginTop: 2 },
  state: { fontSize: 15, fontWeight: "600", marginBottom: 8 },
  row: { flexDirection: "row", gap: 10 },
  btn: {
    flex: 1,
    backgroundColor: "#111",
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  hint: { color: "#666", fontSize: 13, marginBottom: 10 },
  field: { flex: 1 },
  fieldLabel: { fontSize: 12, color: "#666", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 48,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  format: { marginTop: 10, fontSize: 14, fontWeight: "600", color: "#1b7a3d" },
  logBox: { minHeight: 140, backgroundColor: "#0b1220", borderRadius: 10, padding: 10, marginBottom: 24 },
  logHint: { color: "#8aa" },
  logLine: { color: "#cfe", fontFamily: "monospace", fontSize: 12, marginBottom: 2 },
});
