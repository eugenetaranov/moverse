import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useCameraPermissions } from "expo-camera";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import Scanner from "../Scanner";
import Capture, { type CaptureResult } from "../Capture";
import { describe, save } from "../api";
import { classify } from "../labels";
import { ITEM_PREFIX } from "../config";
import { buzzOk, buzzErr } from "../haptics";
import {
  DEFAULT_MODE,
  LabelingMode,
  isOnboarded,
  loadMode,
  saveMode,
  setOnboarded,
} from "../labelingMode";
import qrcode from "qrcode-generator";
import {
  DEFAULT_LABEL,
  DEFAULT_TUNING,
  LabelSize,
  PrintTuning,
  BoxQrContent,
  DEFAULT_BOX_QR,
  fitsQr,
  loadBoxExtra,
  loadBoxQr,
  loadLabelSize,
  loadTuning,
  resolveBoxQrPayload,
} from "../labelSettings";
import { printers } from "../niimbot/connection";
import { renderLabel, renderBoxLabel } from "../niimbot/label";
import { reserveCode, seedReservation } from "../reservation";
import { Box, loadInventory } from "../inventory";
import { colors, radius, space, type as t, HIT } from "../theme";
import {
  PrimaryButton,
  SecondaryButton,
  FieldLabel,
  Center,
  TextField,
  SelectableCard,
  type IconName,
} from "../ui";
import type { PackStackParamList, RootTabParamList } from "../navTypes";

interface Draft {
  itemCode: string;
  boxCode: string;
  description: string;
  photoUri: string;
  photoBase64: string;
}
const EMPTY: Draft = { itemCode: "", boxCode: "", description: "", photoUri: "", photoBase64: "" };

type Screen = "home" | "capture" | "photo" | "scanItem" | "scanBox" | "setBox" | "writeCode" | "label";
type PrintStatus = "idle" | "printing" | "done" | "failed" | "noprinter";
type DescribeState = "idle" | "loading" | "off" | "done";

// Request the Bluetooth permissions needed to scan/connect a printer.
async function requestBlePerms(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const perms =
    Platform.Version >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const res = await PermissionsAndroid.requestMultiple(perms as any);
  return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
}

export default function Pack() {
  const navigation = useNavigation<NativeStackNavigationProp<PackStackParamList, "PackHome">>();
  const [permission, requestPermission] = useCameraPermissions();

  const [onboarded, setOnboardedState] = useState<boolean | null>(null);
  const [mode, setModeState] = useState<LabelingMode>(DEFAULT_MODE);
  const [labelSize, setLabelSize] = useState<LabelSize>(DEFAULT_LABEL);
  const [tuning, setTuning] = useState<PrintTuning>(DEFAULT_TUNING);
  const [boxExtra, setBoxExtra] = useState("");
  const [boxQr, setBoxQr] = useState<BoxQrContent>(DEFAULT_BOX_QR);
  const [printStatus, setPrintStatus] = useState<PrintStatus>("idle");

  const [screen, setScreen] = useState<Screen>("home");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [describeState, setDescribeState] = useState<DescribeState>("idle");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [count, setCount] = useState(0);
  const [, force] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flash, setFlash] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showFlash(kind: "success" | "error", msg: string) {
    setFlash({ kind, msg });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), kind === "error" ? 2400 : 1500);
  }

  useEffect(() => {
    isOnboarded().then(setOnboardedState);
    loadMode().then(setModeState);
    loadLabelSize().then(setLabelSize);
    loadTuning().then(setTuning);
    loadBoxExtra().then(setBoxExtra);
    loadBoxQr().then(setBoxQr);
    void seedReservation();
    void printers.reconnectRemembered();
    return printers.subscribe(() => force((n) => n + 1));
  }, []);
  useEffect(() => {
    if (screen === "home") {
      loadMode().then(setModeState);
      loadLabelSize().then(setLabelSize);
      loadTuning().then(setTuning);
    }
  }, [screen]);

  // Full-screen surfaces (camera, onboarding, permission gate) should own the
  // whole screen, so hide the stack header and the bottom tab bar while any of
  // them is showing.
  useEffect(() => {
    const immersive = !onboarded || !permission?.granted || screen !== "home";
    navigation.setOptions({ headerShown: !immersive });
    navigation
      .getParent<BottomTabNavigationProp<RootTabParamList>>()
      ?.setOptions({ tabBarStyle: immersive ? { display: "none" } : undefined });
  }, [navigation, onboarded, permission, screen]);

  function edit(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }

  async function autoDescribe(b64: string) {
    if (!b64) return;
    setDescribeState("loading");
    try {
      const text = await describe(b64);
      if (text && text.trim()) {
        setDraft((d) => ({ ...d, description: text.trim() }));
        setDescribeState("done");
      } else setDescribeState("off");
    } catch {
      setDescribeState("off");
    }
  }

  function onCaptureDone(r: CaptureResult) {
    const patch: Partial<Draft> = { photoUri: r.photoUri, photoBase64: r.photoBase64 };
    if (r.itemCode) patch.itemCode = r.itemCode;
    edit(patch);
    setScreen("home");
    void autoDescribe(r.photoBase64);
  }

  function applyBox(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const prev = draft.boxCode.trim();
    if (prev && prev !== trimmed) {
      setScreen("home");
      Alert.alert("Switch box?", `Now packing into ${trimmed} instead of ${prev}?`, [
        { text: "Keep " + prev, style: "cancel" },
        { text: "Switch", onPress: () => edit({ boxCode: trimmed }) },
      ]);
    } else {
      edit({ boxCode: trimmed });
      setScreen("home");
    }
  }

  async function startAdd() {
    if (mode === "scan") {
      setScreen("capture");
      return;
    }
    if (mode === "none") {
      setScreen("photo");
      return;
    }
    await assignCode();
  }

  // Assign the next code and open the Label screen (shows the code + QR, prints
  // it if a printer is connected). Keeps any photo already added.
  async function assignCode() {
    setBusy(true);
    try {
      const code = await reserveCode();
      edit({ itemCode: code });
      setPrintStatus("idle");
      setScreen("label");
      void printLabel(code);
    } catch (e) {
      Alert.alert("Couldn't get a code", String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function connectPrinter() {
    setBusy(true);
    try {
      if (!(await requestBlePerms())) {
        Alert.alert("Bluetooth needed", "Grant Bluetooth permission to connect the printer.");
        return;
      }
      await printers.connectFirstAvailable();
      await printLabel();
    } catch (e) {
      Alert.alert("Couldn't connect", String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function printLabel(code = draft.itemCode) {
    if (!code) return;
    const p = printers.printerForKind("item");
    if (!p) {
      setPrintStatus("noprinter");
      buzzErr();
      Alert.alert(
        printers.connected ? "No printer for item labels" : "Printer not connected",
        printers.connected
          ? `No connected printer is set to print item labels. Assign one in Settings, or write ${code} on the item by hand.`
          : `Can't print label ${code}. Connect a printer to print it, or write the code on the item by hand.`,
        [
          { text: "Connect & print", onPress: () => void connectPrinter() },
          { text: "Write by hand" },
          { text: "Cancel", style: "cancel" },
        ],
      );
      return;
    }
    setPrintStatus("printing");
    try {
      await p.client.printImage(renderLabel(code, p.labelSize, p.model.widthPx), tuning.density, tuning.labelType);
      buzzOk();
      setPrintStatus("done");
    } catch {
      buzzErr();
      setPrintStatus("failed");
      Alert.alert(
        "Print failed",
        `Couldn't print label ${code} — the printer may have disconnected. Retry, or write the code by hand.`,
        [
          { text: "Retry", onPress: () => void printLabel(code) },
          { text: "Write by hand" },
          { text: "Cancel", style: "cancel" },
        ],
      );
    }
  }

  // Print a box label (code + QR/text + saved extra text) for a box being set.
  // Routes to the printer assigned box labels; falls back to a hand-write prompt.
  async function printBoxLabel(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const p = printers.printerForKind("box");
    if (!p) {
      Alert.alert(
        printers.connected ? "No printer for box labels" : "Printer not connected",
        printers.connected
          ? `No connected printer is set to print box labels. Assign one in Settings, or write ${trimmed} on the box by hand.`
          : `Connect a printer to print ${trimmed}, or write it on the box by hand.`,
        [
          { text: "Connect & print", onPress: () => void connectAndPrintBox(trimmed) },
          { text: "Write by hand" },
          { text: "Cancel", style: "cancel" },
        ],
      );
      return;
    }
    try {
      const qrPayload = resolveBoxQrPayload(boxQr, trimmed);
      await p.client.printImage(
        renderBoxLabel(trimmed, boxExtra, p.labelSize, p.model.widthPx, qrPayload),
        tuning.density,
        tuning.labelType,
      );
      buzzOk();
    } catch {
      buzzErr();
      Alert.alert("Print failed", `Couldn't print box label ${trimmed}. Retry, or write it by hand.`, [
        { text: "Retry", onPress: () => void printBoxLabel(trimmed) },
        { text: "Write by hand" },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }

  async function connectAndPrintBox(code: string) {
    setBusy(true);
    try {
      if (Platform.OS === "android" && !(await requestBlePerms())) {
        Alert.alert("Bluetooth needed", "Grant Bluetooth permission to connect the printer.");
        return;
      }
      await printers.connectFirstAvailable();
      await printBoxLabel(code);
    } catch (e) {
      Alert.alert("Couldn't connect", String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function doSave() {
    const code = draft.itemCode.trim();
    const box = draft.boxCode.trim();
    setSaving(true);
    try {
      const res = await save({
        itemCode: mode === "none" ? undefined : code,
        boxCode: box,
        description: draft.description.trim(),
        imageBase64: draft.photoBase64,
      });
      buzzOk();
      const shown = res.itemCode ?? code;
      showFlash(
        "success",
        res.action === "exists"
          ? `${shown} already in ${box}`
          : res.action === "added"
            ? `Added ${shown} → ${box}`
            : `Saved ${shown} → ${box}`,
      );
      if (res.action !== "exists") setCount((c) => c + 1);
      setDraft({ ...EMPTY, boxCode: draft.boxCode });
      setDescribeState("idle");
    } catch (e) {
      buzzErr();
      showFlash("error", `Save failed — your entry is kept. ${String((e as Error)?.message ?? e)}`);
    } finally {
      setSaving(false);
    }
  }

  // ---- onboarding / permission gates ----
  if (onboarded === null)
    return (
      <Center>
        <ActivityIndicator color={colors.primary} />
      </Center>
    );
  if (!onboarded)
    return (
      <Onboarding
        onPick={(m) => {
          setModeState(m);
          void saveMode(m);
          void setOnboarded();
          setOnboardedState(true);
        }}
      />
    );
  if (!permission)
    return (
      <Center>
        <ActivityIndicator color={colors.primary} />
      </Center>
    );
  if (!permission.granted)
    return (
      <Center>
        <Ionicons name="camera-outline" size={44} color={colors.mutedFg} />
        <View style={{ height: space.md }} />
        <Text style={styles.bodyCenter}>
          Moverse needs camera access to scan labels and photograph items.
        </Text>
        <View style={{ height: space.lg }} />
        <PrimaryButton title="Grant camera access" onPress={requestPermission} icon="camera" style={styles.stretchBtn} />
      </Center>
    );

  // ---- full-screen surfaces ----
  if (screen === "capture")
    return <Capture startPhase="item" onDone={onCaptureDone} onCancel={() => setScreen("home")} />;
  if (screen === "photo")
    return (
      <Capture
        startPhase="photo"
        itemCode={draft.itemCode}
        onDone={onCaptureDone}
        onCancel={() => setScreen("home")}
      />
    );
  if (screen === "scanItem")
    return (
      <Scanner
        expect="item"
        prompt="Scan the item's QR label (ITM-…)"
        onScan={(code) => {
          edit({ itemCode: code });
          setScreen("home");
        }}
        onReject={(m) => Alert.alert("Wrong label", m)}
        onCancel={() => setScreen("home")}
      />
    );
  if (screen === "scanBox")
    return (
      <Scanner
        expect="box"
        prompt="Scan the box/suitcase QR label (BOX-…)"
        onScan={applyBox}
        onReject={(m) => Alert.alert("Wrong label", m)}
        onCancel={() => setScreen("home")}
      />
    );
  if (screen === "setBox")
    return (
      <SetBox
        onSet={applyBox}
        onScan={() => setScreen("scanBox")}
        onCancel={() => setScreen("home")}
        onPrint={mode === "assign" ? (code) => void printBoxLabel(code) : undefined}
      />
    );
  if (screen === "writeCode")
    return (
      <Center>
        <Ionicons name="create-outline" size={40} color={colors.primary} />
        <Text style={styles.h2}>Write this on the item</Text>
        <Text style={styles.bigCode}>{draft.itemCode}</Text>
        <View style={{ height: space.xl }} />
        <PrimaryButton
          title="Done — take photo"
          icon="arrow-forward"
          accent
          onPress={() => setScreen("photo")}
          style={styles.stretchBtn}
        />
        <View style={{ height: space.sm }} />
        <SecondaryButton
          title="Cancel"
          onPress={() => {
            edit({ itemCode: "" });
            setScreen("home");
          }}
          style={styles.stretchBtn}
        />
      </Center>
    );
  if (screen === "label")
    return (
      <Center>
        <Text style={styles.h2}>Label</Text>
        <Text style={styles.bigCode}>{draft.itemCode}</Text>
        <View style={{ height: space.md }} />
        {fitsQr(printers.printerForKind("item")?.labelSize ?? labelSize) ? (
          <QrPreview text={draft.itemCode} />
        ) : (
          <Text style={styles.bodyCenter}>Text-only label (small stock)</Text>
        )}
        <Text style={styles.printStatus}>
          {printStatus === "printing"
            ? "Printing…"
            : printStatus === "done"
              ? "Printed ✓"
              : printStatus === "failed"
                ? "Print failed"
                : printStatus === "noprinter"
                  ? "Printer not connected — write it on the item"
                  : ""}
        </Text>
        <View style={{ height: space.md }} />
        {printers.printerForKind("item") ? (
          <SecondaryButton
            title={printStatus === "failed" ? "Retry print" : "Print again"}
            icon="print-outline"
            onPress={() => printLabel()}
            disabled={printStatus === "printing" || busy}
            style={styles.stretchBtn}
          />
        ) : (
          <PrimaryButton
            title={busy ? "Connecting…" : "Connect printer & print"}
            icon="bluetooth"
            onPress={connectPrinter}
            disabled={busy}
            style={styles.stretchBtn}
          />
        )}
        <View style={{ height: space.sm }} />
        <PrimaryButton
          title="Add photo"
          icon="camera-outline"
          onPress={() => setScreen("photo")}
          style={styles.stretchBtn}
        />
        <View style={{ height: space.sm }} />
        <SecondaryButton title="Done" onPress={() => setScreen("home")} style={styles.stretchBtn} />
      </Center>
    );

  // ---- home hub ----
  const itemBad = draft.itemCode.trim() !== "" && classify(draft.itemCode) !== "item";
  const itemOk = draft.itemCode.trim() !== "" && !itemBad;
  const boxOk = draft.boxCode.trim() !== "";
  const descOk = draft.description.trim() !== "";
  const needCode = mode !== "none";
  const draftEmpty = draft.itemCode.trim() === "" && draft.photoUri === "";
  const canSave = !saving && boxOk && descOk && (!needCode || itemOk);

  const photoTile = (
    <TouchableOpacity
      onPress={() => setScreen("photo")}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={draft.photoUri ? "Change photo" : "Add photo"}
      style={styles.photoTile}
    >
      {draft.photoUri ? (
        <>
          <Image source={{ uri: draft.photoUri }} style={styles.photoImg} />
          <View style={styles.photoBadge}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </>
      ) : (
        <View style={styles.photoEmpty}>
          <Ionicons name="add" size={30} color={colors.mutedFg} />
          <Text style={styles.photoEmptyText}>Add photo</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const printStatusLine =
    printStatus === "done"
      ? { text: "Printed", color: colors.accent }
      : printStatus === "printing"
        ? { text: "Printing…", color: colors.mutedFg }
        : printStatus === "failed"
          ? { text: "Print failed — tap to retry", color: colors.warning }
          : { text: "Not printed", color: colors.mutedFg };

  return (
    <View style={styles.screen}>
      <TouchableOpacity
        style={[styles.banner, boxOk ? styles.bannerOk : styles.bannerWarn]}
        onPress={() => setScreen("setBox")}
        activeOpacity={0.85}
      >
        <View style={styles.bannerLeft}>
          <Ionicons name="cube-outline" size={20} color={colors.onPrimary} />
          <Text style={styles.bannerText} numberOfLines={1}>
            {boxOk ? `Packing into ${draft.boxCode.trim()}` : "No box — tap to set"}
          </Text>
        </View>
        <Text style={styles.bannerAction}>{boxOk ? "Change" : "Set"}</Text>
      </TouchableOpacity>
      <Text style={[styles.status, toast ? styles.statusToast : styles.statusIdle]}>
        {toast || (count > 0 ? `${count} packed` : "Ready")}
      </Text>

      <ScrollView contentContainerStyle={styles.body2} keyboardShouldPersistTaps="handled">
        {mode === "assign" ? (
          // Photo + code as the item's "identity" pair, side by side.
          <View style={styles.identityRow}>
            {photoTile}
            <View style={styles.identityCol}>
              <FieldLabel text="Item code" done={itemOk} />
              {draft.itemCode ? (
                // Assigned: the code as a value (not a button) + reprint.
                <>
                  <View style={styles.codeValueRow}>
                    <Ionicons name="pricetag-outline" size={18} color={colors.accent} />
                    <Text style={styles.codeValue} numberOfLines={1}>
                      {draft.itemCode}
                    </Text>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                      style={styles.reprintBtn}
                      onPress={() => printLabel(draft.itemCode)}
                      accessibilityRole="button"
                      accessibilityLabel={`Reprint label ${draft.itemCode}`}
                    >
                      <Ionicons name="print-outline" size={20} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.codeStatus, { color: printStatusLine.color }]}>
                    {printStatusLine.text}
                  </Text>
                </>
              ) : (
                // No code yet: an action button, not a field.
                <TouchableOpacity
                  style={[styles.assignPill, busy && styles.btnDisabled]}
                  onPress={assignCode}
                  disabled={busy}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Assign and print an item code"
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="print-outline" size={18} color={colors.primary} />
                  )}
                  <Text style={styles.assignPillText}>{busy ? "Assigning…" : "Assign & print"}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          // scan: photo, then the real code input; none: photo only.
          <>
            {photoTile}
            {mode === "scan" ? (
              <>
                <FieldLabel text="Item code" done={itemOk} />
                <View style={styles.inputRow}>
                  <TextField
                    style={styles.flex}
                    invalid={itemBad}
                    value={draft.itemCode}
                    onChangeText={(v) => edit({ itemCode: v })}
                    placeholder={`${ITEM_PREFIX}0001`}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <View style={{ width: space.sm }} />
                  <SecondaryButton
                    title="Scan"
                    icon="qr-code-outline"
                    onPress={() => setScreen("scanItem")}
                    style={styles.fixedBtn}
                  />
                </View>
                {itemBad ? <Text style={styles.warn}>Expected an {ITEM_PREFIX} code</Text> : null}
              </>
            ) : null}
          </>
        )}

        <View style={styles.descHeader}>
          <FieldLabel text="Description / notes" done={descOk} />
          <TouchableOpacity
            onPress={() => autoDescribe(draft.photoBase64)}
            disabled={!draft.photoBase64 || describeState === "loading"}
            hitSlop={8}
            style={styles.aiLink}
            accessibilityLabel="Auto-describe from photo"
          >
            <Ionicons
              name="sparkles-outline"
              size={13}
              color={draft.photoBase64 ? colors.accent : colors.border}
            />
            <Text style={[styles.aiLinkText, { color: draft.photoBase64 ? colors.accent : colors.border }]}>
              {describeState === "loading" ? "Describing…" : "Auto-describe"}
            </Text>
          </TouchableOpacity>
        </View>
        <TextField
          multiline
          value={draft.description}
          onChangeText={(v) => edit({ description: v })}
          placeholder="Describe the item, or add a note…"
        />
        {describeState === "off" ? (
          <Text style={styles.aiHint}>AI off — type it in.</Text>
        ) : describeState === "done" ? (
          <Text style={styles.aiHint}>AI suggestion added — edit if needed.</Text>
        ) : null}
      </ScrollView>

      {!draftEmpty && !canSave && !saving ? (
        <Text style={styles.saveHint}>
          Add{" "}
          {[!boxOk && "a box", needCode && !itemOk && "a code", !descOk && "a description"]
            .filter(Boolean)
            .join(", ")}{" "}
          to save
        </Text>
      ) : null}
      <View style={styles.actionBar}>
        {draftEmpty ? (
          <PrimaryButton
            title={busy ? "Working…" : "Add item"}
            icon="add"
            onPress={startAdd}
            disabled={busy || !boxOk}
            style={styles.flex}
          />
        ) : (
          <PrimaryButton
            title={saving ? "Saving…" : boxOk ? `Save → ${draft.boxCode.trim()}` : "Save"}
            icon="checkmark"
            accent
            onPress={doSave}
            disabled={!canSave}
            style={styles.flex}
          />
        )}
      </View>

      {saving || flash ? (
        <View style={styles.saveOverlay} pointerEvents="auto">
          {saving ? (
            <View style={styles.saveCard}>
              <ActivityIndicator color="#fff" size="large" />
              <Text style={styles.saveOverlayText}>Saving…</Text>
            </View>
          ) : flash ? (
            <View style={styles.saveCard}>
              <View style={[styles.flashCircle, flash.kind === "success" ? styles.flashOk : styles.flashErr]}>
                <Ionicons name={flash.kind === "success" ? "checkmark" : "close"} size={40} color="#fff" />
              </View>
              <Text style={styles.saveOverlayText}>{flash.msg}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <StatusBar style="dark" />
    </View>
  );
}

// On-screen QR preview of what's on the printed label (rendered from the same
// qrcode-generator matrix used for printing).
function QrPreview({ text }: { text: string }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = Math.max(3, Math.floor(150 / n));
  const rows = [];
  for (let r = 0; r < n; r++) {
    const cells = [];
    for (let c = 0; c < n; c++) {
      cells.push(
        <View
          key={c}
          style={{ width: cell, height: cell, backgroundColor: qr.isDark(r, c) ? "#000" : "#fff" }}
        />,
      );
    }
    rows.push(
      <View key={r} style={{ flexDirection: "row" }}>
        {cells}
      </View>,
    );
  }
  return (
    <View style={{ backgroundColor: "#fff", padding: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm }}>
      {rows}
    </View>
  );
}

function Onboarding({ onPick }: { onPick: (m: LabelingMode) => void }) {
  const cards: { m: LabelingMode; icon: IconName; title: string; sub: string }[] = [
    { m: "assign", icon: "print-outline", title: "I have a label printer", sub: "The app assigns & prints a code per item (or shows it to hand-write)." },
    { m: "scan", icon: "qr-code-outline", title: "Pre-printed sticker sheets", sub: "You stick labels, then scan each one while packing." },
    { m: "none", icon: "camera-outline", title: "Neither — just name boxes", sub: "Name a box and photograph items. No codes." },
  ];
  return (
    <View style={styles.center}>
      <Text style={styles.h1}>How do you label items?</Text>
      <Text style={styles.bodyCenter}>You can change this anytime in Settings.</Text>
      <View style={{ height: space.lg }} />
      <View style={styles.stretchBtn}>
        {cards.map((c) => (
          <SelectableCard
            key={c.m}
            icon={c.icon}
            title={c.title}
            subtitle={c.sub}
            onPress={() => onPick(c.m)}
            trailing={<Ionicons name="chevron-forward" size={20} color={colors.mutedFg} />}
          />
        ))}
      </View>
    </View>
  );
}

function SetBox({
  onSet,
  onScan,
  onCancel,
  onPrint,
}: {
  onSet: (code: string) => void;
  onScan: () => void;
  onCancel: () => void;
  onPrint?: (code: string) => void;
}) {
  const [text, setText] = useState("");
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [open, setOpen] = useState(false);
  const typed = text.trim();
  // A "new" box is one that isn't already in inventory — that's when a label is worth printing.
  const isNewBox = typed !== "" && !boxes.some((b) => b.boxCode.toLowerCase() === typed.toLowerCase());
  useEffect(() => {
    loadInventory(false)
      .then((inv) => setBoxes(inv.boxes))
      .catch(() => {});
  }, []);
  return (
    <ScrollView
      style={styles.setBoxScreen}
      contentContainerStyle={styles.setBoxContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ alignItems: "center" }}>
        <Ionicons name="cube-outline" size={40} color={colors.primary} />
        <Text style={styles.h2}>Which box?</Text>
        <Text style={styles.bodyCenter}>Pick an existing box, scan a label, or type a name.</Text>
      </View>
      <View style={{ height: space.lg }} />

      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen((o) => !o)} activeOpacity={0.8}>
        <Ionicons name="albums-outline" size={18} color={colors.mutedFg} />
        <Text style={styles.dropdownLabel}>
          {boxes.length ? `Pick an existing box (${boxes.length})` : "No existing boxes yet"}
        </Text>
        {boxes.length ? (
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedFg} />
        ) : null}
      </TouchableOpacity>
      {open && boxes.length ? (
        <View style={styles.dropdownList}>
          {boxes.map((b) => (
            <TouchableOpacity
              key={b.boxCode}
              style={styles.dropdownItem}
              onPress={() => onSet(b.boxCode)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.dropdownCode}>{b.boxCode}</Text>
                {b.name ? <Text style={styles.dropdownName}>{b.name}</Text> : null}
              </View>
              <Text style={styles.dropdownCount}>
                {b.itemCount} item{b.itemCount === 1 ? "" : "s"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <Text style={styles.orText}>or type / scan a new one</Text>
      <TextField
        style={styles.stretchBtn}
        value={text}
        onChangeText={setText}
        placeholder="e.g. BOX-0007 or Kitchen"
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <View style={{ height: space.md }} />
      <PrimaryButton title="Set box" onPress={() => onSet(text)} disabled={typed === ""} style={styles.stretchBtn} />
      {onPrint && isNewBox ? (
        <>
          <View style={{ height: space.sm }} />
          <SecondaryButton
            title="Print box label"
            icon="print-outline"
            onPress={() => onPrint(typed)}
            style={styles.stretchBtn}
          />
        </>
      ) : null}
      <View style={{ height: space.sm }} />
      <SecondaryButton title="Scan a box label" icon="qr-code-outline" onPress={onScan} style={styles.stretchBtn} />
      <View style={{ height: space.sm }} />
      <SecondaryButton title="Cancel" onPress={onCancel} style={styles.stretchBtn} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingTop: space.md },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    backgroundColor: colors.bg,
  },
  h1: { ...t.h1, color: colors.fg, textAlign: "center", marginBottom: space.xs },
  h2: { ...t.h2, color: colors.fg, textAlign: "center", marginTop: space.sm, marginBottom: space.sm },
  bigCode: { fontSize: 40, fontWeight: "900", letterSpacing: 2, color: colors.fg },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: space.lg,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
  },
  bannerLeft: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: space.sm },
  bannerOk: { backgroundColor: colors.primary },
  bannerWarn: { backgroundColor: colors.destructive },
  bannerText: { ...t.title, color: colors.onPrimary, marginLeft: space.sm, flexShrink: 1 },
  bannerAction: { fontSize: 14, fontWeight: "700", color: "#CBD5E1" },
  status: { ...t.caption, fontWeight: "600", marginTop: space.sm, marginBottom: space.xs, marginHorizontal: space.lg },
  statusToast: { color: colors.accent },
  statusIdle: { color: colors.mutedFg },
  body2: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xl },
  flex: { flex: 1 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", marginTop: space.lg, marginBottom: space.sm },
  fieldLabel: { ...t.label, color: colors.mutedFg },
  photoTile: { width: 104, height: 104, borderRadius: radius.md, marginTop: space.lg, overflow: "hidden" },
  photoImg: { width: 104, height: 104, borderRadius: radius.md, backgroundColor: colors.muted },
  photoBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(15,23,42,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoEmpty: {
    width: 104,
    height: 104,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  photoEmptyText: { ...t.caption, color: colors.mutedFg, marginTop: 2 },
  identityRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  identityCol: { flex: 1, minHeight: 104 },
  assignPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    paddingHorizontal: space.md,
  },
  assignPillText: { ...t.bodyStrong, color: colors.primary },
  codeValueRow: { flexDirection: "row", alignItems: "center" },
  codeValue: { fontSize: 20, fontWeight: "800", letterSpacing: 0.5, color: colors.fg, marginLeft: 6 },
  codeStatus: { ...t.caption, marginTop: space.xs },
  reprintBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.muted,
    borderRadius: radius.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  chipText: { ...t.bodyStrong, color: colors.fg, marginLeft: space.sm },
  inputRow: { flexDirection: "row", alignItems: "center" },
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
  multiline: { minHeight: 76, paddingTop: space.md, paddingBottom: space.md, textAlignVertical: "top" },
  inputBad: { borderColor: colors.warning, backgroundColor: "#FFFBEB" },
  warn: { color: colors.warning, fontSize: 13, marginTop: space.xs, fontWeight: "600" },
  descHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  aiLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  aiLinkText: { fontSize: 12, fontWeight: "700" },
  aiHint: { ...t.caption, color: colors.mutedFg, marginTop: space.xs },
  bodyCenter: { ...t.body, color: colors.mutedFg, textAlign: "center" },
  stretchBtn: { alignSelf: "stretch" },
  setBoxScreen: { flex: 1, backgroundColor: colors.bg },
  setBoxContent: { padding: space.xl, paddingTop: 56, paddingBottom: space.xxl },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: HIT,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dropdownLabel: { ...t.bodyStrong, color: colors.fg, flex: 1 },
  dropdownList: {
    marginTop: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: HIT,
    paddingHorizontal: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dropdownCode: { ...t.bodyStrong, color: colors.fg },
  dropdownName: { ...t.caption, color: colors.mutedFg },
  dropdownCount: { ...t.caption, color: colors.mutedFg, fontWeight: "600" },
  orText: { ...t.caption, color: colors.mutedFg, textAlign: "center", marginTop: space.lg, marginBottom: space.sm },
  printStatus: { ...t.bodyStrong, color: colors.mutedFg, marginTop: space.md, textAlign: "center" },
  fixedBtn: { minWidth: 136 },
  onCard: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
  },
  onIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  onTitle: { ...t.title, color: colors.fg },
  onSub: { ...t.caption, color: colors.mutedFg, marginTop: 3 },
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
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  saveHint: {
    ...t.caption,
    color: colors.mutedFg,
    textAlign: "center",
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    backgroundColor: colors.surface,
  },
  saveOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
  },
  saveCard: { alignItems: "center", gap: space.md },
  saveOverlayText: { color: "#fff", fontSize: 17, fontWeight: "700", textAlign: "center" },
  flashCircle: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center" },
  flashOk: { backgroundColor: colors.accent },
  flashErr: { backgroundColor: colors.destructive },
});
