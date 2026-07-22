import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
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
import { DEFAULT_TUNING, PrintTuning, loadTuning } from "../labelSettings";
import { printers } from "../niimbot/connection";
import { renderLabel } from "../niimbot/label";
import { printBoxLabels, NoBoxPrinter } from "../boxLabelPrint";
import { printItemLabels, NoItemPrinter } from "../itemLabelPrint";
import { reserveCode, releaseCode, seedReservation } from "../reservation";
import { reserveBoxCode, seedBoxReservation } from "../boxReservation";
import { Box, addItemPhoto, loadInventory } from "../inventory";
import { loadCurrentBox, saveCurrentBox } from "../currentBox";
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

interface Photo {
  uri: string;
  base64: string;
}
interface Draft {
  itemCode: string;
  boxCode: string;
  newBox?: boolean; // "No codes" mode: a new box whose BOX-#### is minted at save
  description: string;
  photos: Photo[];
}
const EMPTY: Draft = { itemCode: "", boxCode: "", description: "", photos: [] };

// A just-saved item kept for the session so its label can be reprinted from the
// idle screen (e.g. after a jam) without hunting for it in Browse.
interface RecentItem {
  itemCode: string;
  description: string;
  photoUri: string;
}

type Screen = "home" | "photo" | "scanItem" | "scanBox" | "setBox" | "writeBox";
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
  const insets = useSafeAreaInsets();

  const [onboarded, setOnboardedState] = useState<boolean | null>(null);
  const [mode, setModeState] = useState<LabelingMode>(DEFAULT_MODE);
  const [tuning, setTuning] = useState<PrintTuning>(DEFAULT_TUNING);
  const [printStatus, setPrintStatus] = useState<PrintStatus>("idle");

  const [screen, setScreen] = useState<Screen>("home");
  const [flowOpen, setFlowOpen] = useState(false); // is the capture sheet up?
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [describeState, setDescribeState] = useState<DescribeState>("idle");
  // assign mode only: the user acknowledged writing the code by hand, which
  // satisfies the "label handled" gate when no printer is available.
  const [handWrote, setHandWrote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [idleBoxes, setIdleBoxes] = useState<Box[]>([]);
  const [, force] = useState(0);
  const [flash, setFlash] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoScrollRef = useRef<ScrollView>(null);

  function showFlash(kind: "success" | "error", msg: string) {
    setFlash({ kind, msg });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), kind === "error" ? 2400 : 1500);
  }

  useEffect(() => {
    isOnboarded().then(setOnboardedState);
    loadMode().then(setModeState);
    loadTuning().then(setTuning);
    loadCurrentBox().then((bc) => {
      if (bc) setDraft((d) => ({ ...d, boxCode: bc }));
    });
    void seedReservation();
    void seedBoxReservation();
    void printers.reconnectRemembered();
    return printers.subscribe(() => force((n) => n + 1));
  }, []);

  // Refresh box list for the idle screen (drives "Create first box" first-run).
  useEffect(() => {
    if (screen === "home" && !flowOpen) {
      loadInventory(false)
        .then((inv) => setIdleBoxes(inv.boxes))
        .catch(() => {});
    }
  }, [screen, flowOpen]);

  // Settings is a pushed screen (Pack isn't remounted when you come back), so
  // reload the labeling mode + label options every time Pack regains focus —
  // otherwise the screen keeps showing the previous mode's UI.
  useFocusEffect(
    useCallback(() => {
      loadMode().then(setModeState);
      loadTuning().then(setTuning);
    }, []),
  );

  // Full-screen surfaces (camera, onboarding, the capture sheet) should own the
  // whole screen, so hide the stack header and the bottom tab bar while any of
  // them is showing.
  useEffect(() => {
    const immersive = !onboarded || !permission?.granted || screen !== "home" || flowOpen;
    navigation.setOptions({ headerShown: !immersive });
    navigation
      .getParent<BottomTabNavigationProp<RootTabParamList>>()
      ?.setOptions({ tabBarStyle: immersive ? { display: "none" } : undefined });
  }, [navigation, onboarded, permission, screen, flowOpen]);

  function edit(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
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
    const wasFirst = draft.photos.length === 0;
    setDraft((d) => ({
      ...d,
      photos: [...d.photos, { uri: r.photoUri, base64: r.photoBase64 }],
      ...(r.itemCode ? { itemCode: r.itemCode } : {}),
    }));
    setScreen("home"); // returns to the sheet (flowOpen stays true)
    // Auto-describe from the first photo only, so adding more doesn't clobber
    // an already-written description.
    if (wasFirst && draft.description.trim() === "") void autoDescribe(r.photoBase64);
  }

  function removePhoto(index: number) {
    setDraft((d) => ({ ...d, photos: d.photos.filter((_, i) => i !== index) }));
  }

  function applyBox(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const prev = draft.boxCode.trim();
    if (prev && prev !== trimmed) {
      setScreen("home");
      Alert.alert("Switch box?", `Now packing into ${trimmed} instead of ${prev}?`, [
        { text: "Keep " + prev, style: "cancel" },
        {
          text: "Switch",
          onPress: () => {
            edit({ boxCode: trimmed, newBox: false });
            void saveCurrentBox(trimmed);
          },
        },
      ]);
    } else {
      edit({ boxCode: trimmed, newBox: false });
      void saveCurrentBox(trimmed);
      setScreen("home");
    }
  }

  // "New box": auto-generate a box code (parity with item codes).
  async function startNewBox() {
    if (mode === "none") {
      // Codeless new box — the server mints BOX-#### at save time.
      edit({ boxCode: "", newBox: true });
      setScreen("home");
      return;
    }
    setBusy(true);
    try {
      const code = await reserveBoxCode();
      edit({ boxCode: code, newBox: false });
      void saveCurrentBox(code);
      if (printers.printerForKind("box")) {
        setScreen("home");
        void printBoxLabel(code);
      } else {
        setScreen("writeBox");
      }
    } catch (e) {
      Alert.alert("Couldn't get a box code", String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  // Mint the next item code and print its label (assign mode). Non-blocking:
  // printing status is surfaced inline and never gates Save.
  async function mintAndPrint() {
    setBusy(true);
    try {
      const code = await reserveCode();
      setDraft((d) => ({ ...d, itemCode: code }));
      void printLabel(code);
    } catch (e) {
      showFlash("error", `Couldn't get a code. ${String((e as Error)?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }

  // Reset to a fresh item, keeping the current box, and (assign mode) mint +
  // print its label straight away so the label is ready before the photo.
  async function beginItem() {
    setPrintStatus("idle");
    setDescribeState("idle");
    setHandWrote(false);
    setDraft((d) => ({ ...EMPTY, boxCode: d.boxCode, newBox: d.newBox }));
    if (mode === "assign") await mintAndPrint();
  }

  // Idle "New item" round button → open the sheet on a fresh item.
  async function startNewItem() {
    setFlowOpen(true);
    await beginItem();
  }

  function closeFlow() {
    // The item was never saved — hand its reserved code back so the next item
    // reuses that number (assign mode mints a code on open).
    if (mode === "assign" && draft.itemCode.trim()) releaseCode(draft.itemCode.trim());
    setFlowOpen(false);
    setDraft((d) => ({ ...EMPTY, boxCode: d.boxCode, newBox: d.newBox }));
    setPrintStatus("idle");
    setDescribeState("idle");
    setHandWrote(false);
  }

  // Backing out: confirm only if the user entered real input for this item.
  function tryCloseFlow() {
    const hasInput = draft.photos.length > 0 || draft.description.trim() !== "";
    if (hasInput) {
      Alert.alert("Discard this item?", "The photo and notes for this item will be discarded.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: closeFlow },
      ]);
    } else {
      closeFlow();
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
      // Non-blocking: surface the state on the sheet's status line; the user can
      // tap Connect there. Never wall off the flow behind an alert.
      setPrintStatus("noprinter");
      buzzErr();
      return;
    }
    setPrintStatus("printing");
    try {
      await p.client.printImage(renderLabel(code, p.labelSize, p.model.widthPx), tuning.density, tuning.labelType);
      buzzOk();
      setPrintStatus("done");
    } catch (e) {
      // A user-initiated cancel is not a failure — reset quietly.
      if (String((e as Error)?.message ?? e).includes("cancel")) {
        setPrintStatus("idle");
        return;
      }
      buzzErr();
      setPrintStatus("failed");
    }
  }

  // Reprint a saved item's label from the idle recent list (no new code minted).
  async function reprintItem(code: string) {
    if (!code) return;
    try {
      const { printed } = await printItemLabels(code, 1);
      if (printed > 0) buzzOk();
      else Alert.alert("Not printed", `No label printed for ${code}.`);
    } catch (e) {
      if (e instanceof NoItemPrinter) {
        Alert.alert(
          printers.connected ? "No printer for item labels" : "Printer not connected",
          printers.connected
            ? `No connected printer is set to print item labels. Assign one in Settings, or write ${code} by hand.`
            : `Connect a printer to reprint ${code}, or write it by hand.`,
          [
            { text: "Connect & print", onPress: () => void connectAndReprint(code) },
            { text: "Cancel", style: "cancel" },
          ],
        );
        return;
      }
      buzzErr();
      Alert.alert("Print failed", `Couldn't reprint ${code}. Try again, or write it by hand.`);
    }
  }

  async function connectAndReprint(code: string) {
    setBusy(true);
    try {
      if (!(await requestBlePerms())) {
        Alert.alert("Bluetooth needed", "Grant Bluetooth permission to connect the printer.");
        return;
      }
      await printers.connectFirstAvailable();
      await reprintItem(code);
    } catch (e) {
      Alert.alert("Couldn't connect", String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  // Print a box label (code + QR/text + saved extra text) for a box being set.
  async function printBoxLabel(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      await printBoxLabels(trimmed, 1);
      buzzOk();
    } catch (e) {
      if (e instanceof NoBoxPrinter) {
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
    const photos = draft.photos;
    setSaving(true);
    try {
      const res = await save({
        itemCode: mode === "none" ? undefined : code,
        boxCode: box || undefined,
        newBox: draft.newBox,
        description: draft.description.trim(),
        imageBase64: photos[0]?.base64 ?? "",
      });
      // Save takes one photo; upload any extras as additional photos on the
      // new item. Best-effort — the item is already saved if these fail.
      let extraFailed = 0;
      if (res.itemId && photos.length > 1) {
        for (const p of photos.slice(1)) {
          try {
            await addItemPhoto(res.itemId, p.base64);
          } catch {
            extraFailed++;
          }
        }
      }
      buzzOk();
      const shown = res.itemCode ?? code;
      const shownBox = res.boxCode ?? box; // may be a server-minted BOX-####
      const base =
        res.action === "exists"
          ? `${shown} already in ${shownBox}`
          : res.action === "added"
            ? `Added ${shown} → ${shownBox}`
            : `Saved ${shown} → ${shownBox}`;
      if (extraFailed > 0) {
        showFlash("error", `${base} — ${extraFailed} extra photo${extraFailed === 1 ? "" : "s"} didn't upload`);
      } else {
        showFlash("success", base);
      }
      if (res.action !== "exists") {
        setCount((c) => c + 1);
        setRecent((r) =>
          [{ itemCode: shown, description: draft.description.trim(), photoUri: photos[0]?.uri ?? "" }, ...r].slice(0, 8),
        );
      }
      // Hold the (possibly newly-minted) box as the current box and loop back to
      // a fresh item, with the next label already printing (assign mode).
      const nextBox = res.boxCode ?? draft.boxCode;
      void saveCurrentBox(nextBox);
      setPrintStatus("idle");
      setDescribeState("idle");
      setHandWrote(false);
      setDraft({ ...EMPTY, boxCode: nextBox });
      if (mode === "assign") await mintAndPrint();
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
        onNew={mode === "scan" ? undefined : () => void startNewBox()}
        busy={busy}
      />
    );
  if (screen === "writeBox")
    return (
      <Center>
        <Ionicons name="create-outline" size={40} color={colors.primary} />
        <Text style={styles.h2}>Write this on the box</Text>
        <Text style={styles.bigCode}>{draft.boxCode}</Text>
        <View style={{ height: space.xl }} />
        <PrimaryButton
          title="Done"
          icon="checkmark"
          accent
          onPress={() => setScreen("home")}
          style={styles.stretchBtn}
        />
        <View style={{ height: space.sm }} />
        <SecondaryButton
          title="Cancel"
          onPress={() => {
            edit({ boxCode: "", newBox: false });
            setScreen("home");
          }}
          style={styles.stretchBtn}
        />
      </Center>
    );

  // ---- derived ----
  const itemBad = draft.itemCode.trim() !== "" && classify(draft.itemCode) !== "item";
  const itemOk = draft.itemCode.trim() !== "" && !itemBad;
  const boxOk = draft.boxCode.trim() !== "" || !!draft.newBox;
  const needCode = mode !== "none";
  // In assign mode the app is meant to produce a physical sticker, so a printer
  // problem is a blocker: Save waits until the label is printed (or the user
  // acknowledges writing the code by hand). scan/none modes print nothing.
  const labelReady = mode !== "assign" || printStatus === "done" || handWrote;
  // Photo and description are both optional; Save needs a box, a valid code
  // (unless none mode), and — in assign mode — the label handled.
  const canSave = !saving && boxOk && (!needCode || itemOk) && labelReady;
  const boxLabel =
    draft.newBox && !draft.boxCode.trim()
      ? "New box — code on save"
      : boxOk
        ? draft.boxCode.trim()
        : "Choose box";
  const hasAnyBox = idleBoxes.length > 0 || boxOk;

  // ---- idle screen ----
  if (!flowOpen) {
    return (
      <View style={styles.screen}>
        <TouchableOpacity
          style={[styles.chipRow, boxOk ? styles.chipRowOk : styles.chipRowWarn]}
          onPress={() => setScreen("setBox")}
          activeOpacity={0.85}
        >
          <View style={styles.bannerLeft}>
            <Ionicons name="cube-outline" size={20} color={colors.onPrimary} />
            <Text style={styles.bannerText} numberOfLines={1}>
              {boxOk ? `Packing into ${boxLabel}` : "No box yet"}
            </Text>
          </View>
          <Text style={styles.bannerAction}>{boxOk ? "Change" : "Set"}</Text>
        </TouchableOpacity>
        <Text style={[styles.status, styles.statusIdle]}>{count > 0 ? `${count} packed` : "Ready"}</Text>

        <ScrollView contentContainerStyle={styles.recentBody}>
          {recent.length === 0 ? (
            <View style={styles.emptyRecent}>
              <Ionicons name="albums-outline" size={30} color={colors.mutedFg} />
              <Text style={styles.emptyRecentText}>
                Items you pack this session appear here — tap the printer to reprint a label.
              </Text>
            </View>
          ) : (
            recent.map((it, i) => (
              <View key={`${it.itemCode}-${i}`} style={styles.recentRow}>
                {it.photoUri ? (
                  <Image source={{ uri: it.photoUri }} style={styles.recentThumb} />
                ) : (
                  <View style={[styles.recentThumb, styles.recentThumbEmpty]}>
                    <Ionicons name="image-outline" size={18} color={colors.mutedFg} />
                  </View>
                )}
                <View style={styles.recentInfo}>
                  {mode !== "none" && it.itemCode ? (
                    <Text style={styles.recentCode} numberOfLines={1}>
                      {it.itemCode}
                    </Text>
                  ) : null}
                  <Text style={styles.recentDesc} numberOfLines={mode !== "none" && it.itemCode ? 1 : 2}>
                    {it.description || "No description"}
                  </Text>
                </View>
                {mode !== "none" && it.itemCode ? (
                  <TouchableOpacity
                    style={styles.recentReprint}
                    onPress={() => void reprintItem(it.itemCode)}
                    accessibilityRole="button"
                    accessibilityLabel={`Reprint label ${it.itemCode}`}
                  >
                    <Ionicons name="print-outline" size={20} color={colors.primary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.fab}>
          {hasAnyBox ? (
            <TouchableOpacity
              style={[styles.roundBtn, busy && styles.btnDisabled]}
              onPress={() => void startNewItem()}
              disabled={busy}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="New item"
            >
              <Ionicons name="add" size={40} color={colors.onPrimary} />
              <Text style={styles.roundBtnText}>New item</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.roundBtn}
              onPress={() => setScreen("setBox")}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Create first box"
            >
              <Ionicons name="cube" size={36} color={colors.onPrimary} />
              <Text style={styles.roundBtnText}>Create{"\n"}first box</Text>
            </TouchableOpacity>
          )}
        </View>

        {flash ? (
          <View style={styles.saveOverlay} pointerEvents="none">
            <View style={styles.saveCard}>
              <View style={[styles.flashCircle, flash.kind === "success" ? styles.flashOk : styles.flashErr]}>
                <Ionicons name={flash.kind === "success" ? "checkmark" : "close"} size={40} color="#fff" />
              </View>
              <Text style={styles.saveOverlayText}>{flash.msg}</Text>
            </View>
          </View>
        ) : null}
        <StatusBar style="dark" />
      </View>
    );
  }

  // ---- capture sheet ----
  const printStatusText =
    printStatus === "printing"
      ? "Printing…"
      : printStatus === "done"
        ? "Printed ✓"
        : handWrote
          ? "Write the code on the item by hand"
          : printStatus === "noprinter"
            ? "No printer — connect to print the label"
            : printStatus === "failed"
              ? "Print failed — connect or retry"
              : busy
                ? "Preparing…"
                : "";
  const printStatusColor =
    printStatus === "done"
      ? colors.accent
      : handWrote
        ? colors.mutedFg
        : printStatus === "failed" || printStatus === "noprinter"
          ? colors.warning
          : colors.mutedFg;
  const firstPhotoB64 = draft.photos[0]?.base64 ?? "";

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.sheetHeader}>
        <TouchableOpacity
          style={styles.boxChip}
          onPress={() => setScreen("setBox")}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Change box"
        >
          <Ionicons name="cube-outline" size={18} color={colors.primary} />
          <Text style={styles.boxChipText} numberOfLines={1}>
            Into {boxLabel}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.mutedFg} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={tryCloseFlow}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Ionicons name="close" size={22} color={colors.mutedFg} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body2} keyboardShouldPersistTaps="handled">
        {mode === "assign" ? (
          <View style={styles.codeCard}>
            <View style={styles.codeValueRow}>
              <Ionicons name="pricetag-outline" size={18} color={colors.accent} />
              <Text style={styles.codeValue} numberOfLines={1}>
                {draft.itemCode || "…"}
              </Text>
              <View style={{ flex: 1 }} />
              {printStatus === "printing" ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : printStatus === "noprinter" && !handWrote ? (
                <TouchableOpacity style={styles.inlineBtn} onPress={() => void connectPrinter()} disabled={busy}>
                  <Ionicons name="bluetooth" size={15} color={colors.primary} />
                  <Text style={styles.inlineBtnText}>Connect</Text>
                </TouchableOpacity>
              ) : printStatus === "failed" && !handWrote ? (
                <TouchableOpacity style={styles.inlineBtn} onPress={() => void printLabel(draft.itemCode)}>
                  <Ionicons name="refresh" size={15} color={colors.primary} />
                  <Text style={styles.inlineBtnText}>Retry</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.inlineBtn}
                  onPress={() => void printLabel(draft.itemCode)}
                  disabled={!draft.itemCode}
                >
                  <Ionicons name="print-outline" size={16} color={colors.primary} />
                  <Text style={styles.inlineBtnText}>{printStatus === "done" ? "Reprint" : "Print"}</Text>
                </TouchableOpacity>
              )}
            </View>
            {printStatusText ? (
              <Text style={[styles.codeStatus, { color: printStatusColor }]}>{printStatusText}</Text>
            ) : null}
            {(printStatus === "noprinter" || printStatus === "failed") && !handWrote ? (
              <TouchableOpacity onPress={() => setHandWrote(true)} hitSlop={8} style={styles.handLink}>
                <Text style={styles.handLinkText}>No printer? Write the code by hand to save</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : mode === "scan" ? (
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

        {draft.photos.length === 0 ? (
          <TouchableOpacity
            onPress={() => setScreen("photo")}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            style={styles.bigPhotoTile}
          >
            <View style={styles.bigPhotoEmpty}>
              <Ionicons name="camera" size={34} color={colors.primary} />
              <Text style={styles.bigPhotoText}>Take photo</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <ScrollView
            ref={photoScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoStrip}
            keyboardShouldPersistTaps="handled"
            // Keep the ＋ tile in view as photos are added; the strip scrolls to
            // the end, leaving the previous photo peeking on the left to signal
            // there's more to the left.
            onContentSizeChange={() => photoScrollRef.current?.scrollToEnd({ animated: true })}
          >
            {draft.photos.map((p, i) => (
              <View key={`${p.uri}-${i}`} style={styles.photoThumbWrap}>
                <Image source={{ uri: p.uri }} style={styles.photoThumb} />
                <TouchableOpacity
                  style={styles.photoDelete}
                  onPress={() => removePhoto(i)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete photo ${i + 1}`}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              style={styles.addPhotoTile}
              onPress={() => setScreen("photo")}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Add another photo"
            >
              <Ionicons name="add" size={30} color={colors.primary} />
              <Text style={styles.addPhotoText}>Add</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        <View style={styles.descHeader}>
          <FieldLabel text="Description / notes (optional)" done={draft.description.trim() !== ""} />
          <TouchableOpacity
            onPress={() => autoDescribe(firstPhotoB64)}
            disabled={!firstPhotoB64 || describeState === "loading"}
            hitSlop={8}
            style={styles.aiLink}
            accessibilityLabel="Auto-describe from photo"
          >
            <Ionicons name="sparkles-outline" size={13} color={firstPhotoB64 ? colors.accent : colors.mutedFg} />
            <Text style={[styles.aiLinkText, { color: firstPhotoB64 ? colors.accent : colors.mutedFg }]}>
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

      {!canSave && !saving ? (
        <View style={styles.saveHintRow}>
          <Ionicons name="information-circle-outline" size={14} color={colors.warning} />
          <Text style={styles.saveHint}>
            {!boxOk
              ? "Choose a box to save into"
              : needCode && !itemOk
                ? "Scan or enter the item code to save"
                : printStatus === "printing"
                  ? "Printing the label…"
                  : printStatus === "failed"
                    ? "Print failed — retry, or write the code by hand"
                    : printStatus === "noprinter"
                      ? "Connect a printer to print the label, or write the code by hand"
                      : "Preparing the label…"}
          </Text>
        </View>
      ) : null}
      <View style={styles.actionBar}>
        <PrimaryButton
          title={saving ? "Saving…" : "Save item"}
          icon="checkmark"
          accent
          onPress={doSave}
          disabled={!canSave}
          style={styles.flex}
        />
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
  onNew,
  busy,
}: {
  onSet: (code: string) => void;
  onScan: () => void;
  onCancel: () => void;
  onPrint?: (code: string) => void;
  onNew?: () => void;
  busy?: boolean;
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
        <Text style={styles.bodyCenter}>Start a new box, pick an existing one, scan a label, or type a name.</Text>
      </View>
      <View style={{ height: space.lg }} />

      {onNew ? (
        <>
          <PrimaryButton
            title={busy ? "Working…" : "New box"}
            icon="add"
            accent
            onPress={onNew}
            disabled={busy}
            style={styles.stretchBtn}
          />
          <Text style={styles.orText}>or pick / scan / type</Text>
        </>
      ) : null}

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
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: space.lg,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
  },
  chipRowOk: { backgroundColor: colors.primary },
  chipRowWarn: { backgroundColor: colors.warning },
  bannerLeft: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: space.sm },
  bannerText: { ...t.title, color: colors.onPrimary, marginLeft: space.sm, flexShrink: 1 },
  bannerAction: { fontSize: 14, fontWeight: "700", color: colors.onPrimary },
  status: { ...t.caption, fontWeight: "600", marginTop: space.sm, marginBottom: space.xs, marginHorizontal: space.lg },
  statusIdle: { color: colors.mutedFg },
  recentBody: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xl, flexGrow: 1 },
  emptyRecent: { alignItems: "center", justifyContent: "center", paddingVertical: space.xxl, gap: space.sm },
  emptyRecentText: { ...t.body, color: colors.mutedFg, textAlign: "center", paddingHorizontal: space.xl },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
    marginBottom: space.sm,
  },
  recentThumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.muted },
  recentThumbEmpty: { alignItems: "center", justifyContent: "center" },
  recentInfo: { flex: 1, marginLeft: space.md, marginRight: space.sm },
  recentCode: { ...t.bodyStrong, color: colors.fg },
  recentDesc: { ...t.caption, color: colors.mutedFg },
  recentReprint: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    alignItems: "center",
    paddingBottom: space.xxl,
    paddingTop: space.md,
  },
  roundBtn: {
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  roundBtnText: { color: colors.onPrimary, fontSize: 17, fontWeight: "800", textAlign: "center" },
  body2: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xl },
  flex: { flex: 1 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    gap: space.md,
  },
  boxChip: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 6,
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  boxChipText: { ...t.bodyStrong, color: colors.fg, flexShrink: 1 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  codeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginTop: space.sm,
  },
  codeValueRow: { flexDirection: "row", alignItems: "center" },
  codeValue: { fontSize: 20, fontWeight: "800", letterSpacing: 0.5, color: colors.fg, marginLeft: 6 },
  codeStatus: { ...t.caption, marginTop: space.xs },
  inlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
  },
  inlineBtnText: { ...t.caption, color: colors.primary, fontWeight: "700" },
  handLink: { marginTop: space.sm },
  handLinkText: { ...t.caption, color: colors.primary, fontWeight: "700", textDecorationLine: "underline" },
  bigPhotoTile: {
    width: "100%",
    height: 200,
    borderRadius: radius.md,
    marginTop: space.lg,
    overflow: "hidden",
  },
  bigPhotoEmpty: {
    width: "100%",
    height: 200,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
  bigPhotoText: { ...t.bodyStrong, color: colors.primary },
  photoStrip: { paddingTop: space.lg, gap: space.sm },
  photoThumbWrap: { width: 150, height: 200 },
  photoThumb: { width: 150, height: 200, borderRadius: radius.md, backgroundColor: colors.muted },
  photoDelete: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(15,23,42,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoTile: {
    width: 150,
    height: 200,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  addPhotoText: { ...t.caption, color: colors.primary, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "center", marginTop: space.sm },
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
  fixedBtn: { minWidth: 120 },
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
  saveHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    backgroundColor: colors.surface,
  },
  saveHint: { ...t.caption, color: colors.mutedFg, textAlign: "center", flexShrink: 1 },
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
