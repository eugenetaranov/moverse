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
import { BleTransport } from "./niimbot/transport";
import { NiimbotClient } from "./niimbot/client";
import { makeTestImage } from "./niimbot/testImage";
import { DEFAULT_LABEL, LabelSize, fitsQr, loadLabelSize, saveLabelSize } from "./labelSettings";

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

export default function Settings({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [label, setLabel] = useState<LabelSize>(DEFAULT_LABEL);
  const transport = useRef<BleTransport | null>(null);
  const client = useRef<NiimbotClient | null>(null);

  const log = (s: string) => setLines((l) => [...l.slice(-80), s]);

  useEffect(() => {
    loadLabelSize().then(setLabel);
  }, []);

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
      const t = new BleTransport(log);
      const name = await t.connect("b1");
      transport.current = t;
      client.current = new NiimbotClient(t, log);
      setConnectedName(name);
      log(`connected: ${name}`);
    } catch (e) {
      log(`connect failed: ${String((e as Error)?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await transport.current?.disconnect();
    } catch {
      // ignore
    } finally {
      transport.current = null;
      client.current = null;
      setConnectedName(null);
      log("disconnected");
      setBusy(false);
    }
  }

  async function printTest() {
    if (!client.current) {
      log("connect first");
      return;
    }
    setBusy(true);
    try {
      log("printing test label…");
      await client.current.printImage(makeTestImage(), 3, 1);
    } catch (e) {
      log(`print failed: ${String((e as Error)?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Settings</Text>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <Text style={styles.close}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* Printer */}
      <Text style={styles.section}>Printer (NIIMBOT B1)</Text>
      <Text style={styles.state}>
        {connectedName ? `● Connected: ${connectedName}` : "○ Not connected"}
      </Text>
      <View style={styles.row}>
        {connectedName ? (
          <Btn title="Disconnect" onPress={disconnect} disabled={busy} />
        ) : (
          <Btn title="Connect" onPress={connect} disabled={busy} />
        )}
        <Btn title="Print test label" onPress={printTest} disabled={busy || !connectedName} />
      </View>

      {/* Label size */}
      <Text style={styles.section}>Label size (mm)</Text>
      <Text style={styles.hint}>
        Set this if it isn't detected automatically. Determines whether labels print as QR + text or
        text-only.
      </Text>
      <View style={styles.row}>
        <Field
          label="Width"
          value={label.widthMm}
          onChange={(n) => updateLabel({ widthMm: n })}
        />
        <Field
          label="Height"
          value={label.heightMm}
          onChange={(n) => updateLabel({ heightMm: n })}
        />
      </View>
      <Text style={styles.format}>
        Format: {fitsQr(label) ? "QR code + text" : "text only"}
      </Text>

      {/* Log */}
      <Text style={styles.section}>Log</Text>
      <ScrollView style={styles.logBox} contentContainerStyle={{ padding: 10 }}>
        {lines.length === 0 ? (
          <Text style={styles.logHint}>Connect, then Print test label. Watch this log.</Text>
        ) : (
          lines.map((l, i) => (
            <Text key={i} style={styles.logLine}>
              {l}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
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

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={String(value)}
        onChangeText={(t) => {
          const n = parseInt(t.replace(/[^0-9]/g, ""), 10);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff", paddingTop: 56, paddingHorizontal: 16 },
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
    marginTop: 20,
    marginBottom: 8,
  },
  state: { fontSize: 15, fontWeight: "600", marginBottom: 10 },
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
  logBox: { flex: 1, backgroundColor: "#0b1220", borderRadius: 10, marginBottom: 16 },
  logHint: { color: "#8aa" },
  logLine: { color: "#cfe", fontFamily: "monospace", fontSize: 12, marginBottom: 2 },
});
