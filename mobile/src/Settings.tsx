import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { ManagedPrinter, ScanCancelledError, printers } from "./niimbot/connection";
import { PrinterRole, ROLE_LABELS, ROLE_ORDER } from "./niimbot/roles";
import { makeTestImage } from "./niimbot/testImage";
import {
  BoxQrContent,
  BoxQrMode,
  DEFAULT_BOX_QR,
  DEFAULT_TUNING,
  LABEL_TYPES,
  LabelSize,
  PrintTuning,
  fitsQr,
  labelPx,
  loadBoxExtra,
  loadBoxQr,
  loadTuning,
  saveBoxExtra,
  saveBoxQr,
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
  const [logOpen, setLogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const printing = printingId !== null;
  const [, force] = useState(0);
  const [mode, setMode] = useState<LabelingMode>("assign");
  const [tuning, setTuning] = useState<PrintTuning>(DEFAULT_TUNING);
  const [boxExtra, setBoxExtra] = useState("");
  const [savedExtra, setSavedExtra] = useState("");
  const extraDirty = boxExtra !== savedExtra;
  const [boxQr, setBoxQr] = useState<BoxQrContent>(DEFAULT_BOX_QR);
  const [sizeSavedId, setSizeSavedId] = useState<string | null>(null);
  const sizeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const log = (s: string) => setLines((l) => [...l.slice(-80), s]);

  // Persist a printer's label size and briefly flag it as saved (the fields
  // commit on blur, so without this the save is invisible).
  function changeLabelSize(id: string, size: LabelSize) {
    printers.setLabelSize(id, size);
    setSizeSavedId(id);
    if (sizeSaveTimer.current) clearTimeout(sizeSaveTimer.current);
    sizeSaveTimer.current = setTimeout(() => setSizeSavedId(null), 1800);
  }

  useEffect(() => {
    loadMode().then(setMode);
    loadTuning().then(setTuning);
    loadBoxExtra().then((v) => {
      setBoxExtra(v);
      setSavedExtra(v);
    });
    loadBoxQr().then(setBoxQr);
    printers.log = log;
    void printers.reconnectRemembered();
    return printers.subscribe(() => force((n) => n + 1));
  }, []);

  function saveExtra() {
    void saveBoxExtra(boxExtra);
    setSavedExtra(boxExtra);
    log("box label extra text saved");
  }

  function updateBoxQr(patch: Partial<BoxQrContent>) {
    setBoxQr((prev) => {
      const next = { ...prev, ...patch };
      void saveBoxQr(next);
      return next;
    });
  }

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
    // Printing only applies to "assign" — drop all printer links otherwise.
    if (m !== "assign" && printers.connected) {
      void printers.disconnectAll();
      log("printers disconnected (not used in this mode)");
    }
  }
  // Connect an additional printer (scan → first not-yet-connected device).
  async function addPrinter() {
    setBusy(true);
    try {
      if (!(await requestBlePermissions())) {
        log("permissions denied");
        return;
      }
      log("scanning for a printer…");
      const mp = await printers.connectFirstAvailable();
      log(`connected: ${mp.name} (${mp.model.label})`);
    } catch (e) {
      if (e instanceof ScanCancelledError) {
        log("scan cancelled");
      } else {
        log(`connect failed: ${String((e as Error)?.message ?? e)}`);
      }
    } finally {
      setBusy(false);
    }
  }
  async function disconnectOne(mp: ManagedPrinter) {
    setBusy(true);
    try {
      await printers.forget(mp.id);
      log(`disconnected ${mp.name}`);
    } finally {
      setBusy(false);
    }
  }
  async function printTestOn(mp: ManagedPrinter) {
    setPrintingId(mp.id);
    try {
      const { widthPx, heightPx } = labelPx(mp.labelSize, mp.model.widthPx);
      log(`printing test ${widthPx}x${heightPx} on ${mp.name} (d${tuning.density}, type ${tuning.labelType})…`);
      await mp.client.printImage(makeTestImage(widthPx, heightPx), tuning.density, tuning.labelType);
      printers.markTested(mp.id);
      log("print done");
    } catch (e) {
      log(`print stopped: ${String((e as Error)?.message ?? e)}`);
    } finally {
      setPrintingId(null);
    }
  }
  async function cancelPrintOn(mp: ManagedPrinter) {
    mp.client.cancel();
    log("cancelling…");
    try {
      await printers.disconnect(mp.id);
    } catch {
      // ignore
    }
    setPrintingId(null);
  }

  async function copyLog() {
    await Clipboard.setStringAsync(lines.join("\n"));
    log("(log copied to clipboard)");
  }

  // Coverage guidance for the role assignments (only meaningful with a printer).
  const uncovered = printers.uncoveredKinds();
  const anyCount = printers.list().filter((p) => p.role === "any").length;
  let coverageHint = "";
  if (printers.list().length > 0 && uncovered.length) {
    coverageHint = `No printer is set to print ${uncovered.join(" or ")} labels.`;
  } else if (printers.list().length > 1 && anyCount > 1) {
    coverageHint = "Two printers print “Any” — jobs go to one of them. Assign roles to control which prints what.";
  }

  // The QR-content choice only matters when a QR will actually print: a box-role
  // printer with a QR-capable label that has passed a test print.
  const boxPrinter = printers.printerForKind("box");
  const qrEnabled = !!boxPrinter && fitsQr(boxPrinter.labelSize) && boxPrinter.testPassed;

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
      {/* Printers */}
      <SectionHeader>Printers</SectionHeader>
      {printers.list().length === 0 ? (
        <Text style={styles.hint}>No printer connected.</Text>
      ) : (
        printers.list().map((mp) => {
          const isPrinting = printingId === mp.id;
          const multi = printers.list().length > 1;
          return (
            <View key={mp.id} style={styles.printerCard}>
              <View style={styles.stateRow}>
                <Ionicons name="print" size={18} color={colors.accent} />
                <Text style={styles.state}>{mp.model.label}</Text>
                {!mp.model.verified ? <Text style={styles.unverified}>untested</Text> : null}
              </View>
              <Text style={styles.printerName}>{mp.name}</Text>

              {multi ? (
                <View style={styles.roleBlock}>
                  <Text style={styles.tuneLabel}>Prints</Text>
                  <Segmented
                    options={ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                    value={mp.role}
                    onChange={(v) => printers.setRole(mp.id, v as PrinterRole)}
                  />
                </View>
              ) : null}

              <View style={styles.roleBlock}>
                <View style={styles.sizeHead}>
                  <Text style={styles.tuneLabel}>Label size (mm)</Text>
                  {sizeSavedId === mp.id ? (
                    <View style={styles.savedTag}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
                      <Text style={styles.savedTagText}>Saved</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.row}>
                  <Field
                    label="Width"
                    value={mp.labelSize.widthMm}
                    onChange={(n) => changeLabelSize(mp.id, { ...mp.labelSize, widthMm: n })}
                  />
                  <Field
                    label="Height"
                    value={mp.labelSize.heightMm}
                    onChange={(n) => changeLabelSize(mp.id, { ...mp.labelSize, heightMm: n })}
                  />
                </View>
                <View style={styles.formatRow}>
                  <Ionicons
                    name={fitsQr(mp.labelSize) ? "qr-code-outline" : "text-outline"}
                    size={15}
                    color={colors.accent}
                  />
                  <Text style={styles.format}>{fitsQr(mp.labelSize) ? "QR code + text" : "Text only"}</Text>
                  <Text style={styles.headHint}>· head {Math.round(mp.model.widthPx / 8)}mm max</Text>
                </View>
              </View>

              <View style={[styles.row, { marginTop: space.md }]}>
                <Button
                  title="Disconnect"
                  onPress={() => disconnectOne(mp)}
                  disabled={busy || isPrinting}
                  style={styles.flexBtn}
                />
                {isPrinting ? (
                  <Button title="Cancel print" icon="close" tone="danger" onPress={() => cancelPrintOn(mp)} style={styles.flexBtn} />
                ) : (
                  <Button
                    title="Print test"
                    icon="print-outline"
                    onPress={() => printTestOn(mp)}
                    disabled={busy || printing}
                    style={styles.flexBtn}
                  />
                )}
              </View>
            </View>
          );
        })
      )}
      <View style={{ height: space.sm }} />
      {printers.scanning ? (
        <View style={styles.scanRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.scanText}>Searching for a printer…</Text>
          <TouchableOpacity onPress={() => printers.cancelScan()} hitSlop={8} style={styles.scanCancel}>
            <Ionicons name="close-circle" size={22} color={colors.mutedFg} />
          </TouchableOpacity>
        </View>
      ) : (
        <Button
          title={printers.list().length ? "Add another printer" : "Connect a printer"}
          icon="add"
          tone="accent"
          onPress={addPrinter}
          disabled={busy}
        />
      )}
      {coverageHint ? <Text style={[styles.hint, { marginTop: space.sm }]}>{coverageHint}</Text> : null}
      <TouchableOpacity
        style={styles.logMiniLink}
        onPress={() => setLogOpen(true)}
        hitSlop={8}
        accessibilityLabel="View printer log"
      >
        <Ionicons name="document-text-outline" size={13} color={colors.mutedFg} />
        <Text style={styles.logMiniText}>View printer log{lines.length ? ` (${lines.length})` : ""}</Text>
      </TouchableOpacity>

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

      {/* Box labels */}
      <SectionHeader>Box labels</SectionHeader>
      <Text style={styles.hint}>
        Printed when you add a new box — the box code (QR + text, or text-only by size) plus this
        extra text (phone / WhatsApp / address).
      </Text>
      <Text style={styles.fieldLabel}>Extra text on every box label</Text>
      <TextField
        multiline
        value={boxExtra}
        onChangeText={setBoxExtra}
        placeholder={"e.g. Call/WhatsApp +1 555 123 4567\n123 Main St, City"}
      />
      <View style={{ height: space.sm }} />
      <Button
        title={extraDirty ? "Save extra text" : "Saved"}
        icon={extraDirty ? "save-outline" : "checkmark"}
        tone="accent"
        onPress={saveExtra}
        disabled={!extraDirty}
      />

      <View style={{ height: space.lg }} />
      <Text style={styles.fieldLabel}>QR code content</Text>
      <View pointerEvents={qrEnabled ? "auto" : "none"} style={qrEnabled ? undefined : styles.disabledBlock}>
        <Segmented
          options={[
            { value: "code", label: "Box code" },
            { value: "url", label: "Link / URL" },
          ]}
          value={boxQr.mode}
          onChange={(v) => updateBoxQr({ mode: v as BoxQrMode })}
        />
        {boxQr.mode === "url" ? (
          <>
            <View style={{ height: space.sm }} />
            <TextField
              value={boxQr.urlTemplate}
              onChangeText={(v) => updateBoxQr({ urlTemplate: v })}
              placeholder="https://wa.me/15551234567?text=Box%20{code}"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>{"{code}"} inserts the box code into the link.</Text>
          </>
        ) : null}
      </View>
      {!qrEnabled ? (
        <Text style={[styles.hint, { marginTop: space.xs }]}>
          Connect a large-label box printer and run a test print to choose QR content.
        </Text>
      ) : null}

        </>
      )}

      <Modal
        visible={logOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setLogOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Printer log</Text>
              <View style={styles.modalHeadActions}>
                <TouchableOpacity
                  onPress={copyLog}
                  disabled={lines.length === 0}
                  hitSlop={8}
                  style={styles.modalAction}
                >
                  <Ionicons name="copy-outline" size={16} color={colors.accent} />
                  <Text style={styles.modalActionText}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setLogOpen(false)} hitSlop={8} style={styles.modalAction}>
                  <Ionicons name="close" size={16} color={colors.fg} />
                  <Text style={[styles.modalActionText, { color: colors.fg }]}>Hide</Text>
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={styles.logBox} contentContainerStyle={{ padding: space.md }}>
              {lines.length === 0 ? (
                <Text style={styles.logHint}>Connect, then Print test. Watch this log.</Text>
              ) : (
                lines.map((l, i) => (
                  <Text key={i} style={styles.logLine}>
                    {l}
                  </Text>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  printerCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    backgroundColor: colors.surface,
  },
  printerName: { ...t.caption, color: colors.mutedFg, marginTop: 2 },
  unverified: {
    ...t.caption,
    color: colors.mutedFg,
    marginLeft: space.sm,
    fontStyle: "italic",
  },
  roleBlock: { marginTop: space.md },
  sizeHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.xs },
  savedTag: { flexDirection: "row", alignItems: "center", gap: 3 },
  savedTagText: { ...t.caption, color: colors.accent, fontWeight: "600" },
  headHint: { ...t.caption, color: colors.mutedFg, marginLeft: space.xs },
  disabledBlock: { opacity: 0.45 },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: colors.surface,
  },
  scanText: { ...t.body, color: colors.fg, flex: 1 },
  scanCancel: { padding: 2 },
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
  logMiniLink: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: space.sm, paddingVertical: space.xs },
  logMiniText: { ...t.caption, color: colors.mutedFg, textDecorationLine: "underline" },
  modalAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  modalActionText: { color: colors.accent, fontWeight: "700", fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    maxHeight: "80%",
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  modalTitle: { ...t.h2, color: colors.fg },
  modalHeadActions: { flexDirection: "row", alignItems: "center", gap: space.lg },
  logBox: {
    backgroundColor: "#0F172A",
    borderRadius: radius.md,
  },
  logHint: { color: "#94A3B8" },
  logLine: { color: "#BAE6FD", fontFamily: "monospace", fontSize: 12, marginBottom: 2 },
});
