import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import Scanner from "./src/Scanner";
import Capture, { type CaptureResult } from "./src/Capture";
import Settings from "./src/Settings";
import { describe, save } from "./src/api";
import { classify } from "./src/labels";
import { ITEM_PREFIX } from "./src/config";
import { buzzOk, buzzErr } from "./src/haptics";
import {
  DEFAULT_MODE,
  LabelingMode,
  isOnboarded,
  loadMode,
  saveMode,
  setOnboarded,
} from "./src/labelingMode";
import { DEFAULT_LABEL, LabelSize, loadLabelSize } from "./src/labelSettings";
import { printer } from "./src/niimbot/connection";
import { renderLabel } from "./src/niimbot/label";
import { reserveCode, seedReservation } from "./src/reservation";

interface Draft {
  itemCode: string;
  boxCode: string;
  description: string;
  photoUri: string;
  photoBase64: string;
}
const EMPTY: Draft = { itemCode: "", boxCode: "", description: "", photoUri: "", photoBase64: "" };

type Screen = "home" | "capture" | "photo" | "scanItem" | "scanBox" | "setBox" | "writeCode" | "settings";
type DescribeState = "idle" | "loading" | "off" | "done";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();

  const [onboarded, setOnboardedState] = useState<boolean | null>(null);
  const [mode, setModeState] = useState<LabelingMode>(DEFAULT_MODE);
  const [labelSize, setLabelSize] = useState<LabelSize>(DEFAULT_LABEL);

  const [screen, setScreen] = useState<Screen>("home");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [describeState, setDescribeState] = useState<DescribeState>("idle");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [count, setCount] = useState(0);
  const [, force] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isOnboarded().then(setOnboardedState);
    loadMode().then(setModeState);
    loadLabelSize().then(setLabelSize);
    void seedReservation();
    return printer.subscribe(() => force((n) => n + 1));
  }, []);
  // Re-read mode/label when returning from Settings.
  useEffect(() => {
    if (screen === "home") {
      loadMode().then(setModeState);
      loadLabelSize().then(setLabelSize);
    }
  }, [screen]);

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

  // Start adding an item — behaviour depends on the labeling mode.
  async function startAdd() {
    if (mode === "scan") {
      setScreen("capture");
      return;
    }
    if (mode === "none") {
      setScreen("photo");
      return;
    }
    // assign: reserve a code, print it (if a printer is connected) or show it to
    // hand-write, then go to the photo.
    setBusy(true);
    try {
      const code = await reserveCode();
      edit({ itemCode: code });
      if (printer.connected && printer.client) {
        try {
          await printer.client.printImage(renderLabel(code, labelSize));
          buzzOk();
          showToast(`Printed ${code}`);
        } catch {
          buzzErr();
          showToast(`Print failed — write ${code}`);
        }
        setScreen("photo");
      } else {
        setScreen("writeCode");
      }
    } catch (e) {
      Alert.alert("Couldn't get a code", String((e as Error)?.message ?? e));
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
      showToast(
        res.action === "exists"
          ? `${shown} already in ${box}`
          : res.action === "added"
            ? `Added ${shown} → ${box} ✓`
            : `Saved ${shown} → ${box} ✓`,
      );
      if (res.action !== "exists") setCount((c) => c + 1);
      setDraft({ ...EMPTY, boxCode: draft.boxCode });
      setDescribeState("idle");
    } catch (e) {
      buzzErr();
      Alert.alert("Save failed", String(e) + "\nYour entry is kept — try again.");
    } finally {
      setSaving(false);
    }
  }

  // ---- onboarding / permission gates ----
  if (onboarded === null) {
    return (
      <Center>
        <ActivityIndicator />
      </Center>
    );
  }
  if (!onboarded) {
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
  }
  if (!permission) {
    return (
      <Center>
        <ActivityIndicator />
      </Center>
    );
  }
  if (!permission.granted) {
    return (
      <Center>
        <Text style={styles.body}>
          Moverse needs camera access to scan labels and photograph items.
        </Text>
        <View style={{ height: 12 }} />
        <PrimaryButton title="Grant camera access" onPress={requestPermission} />
      </Center>
    );
  }

  // ---- full-screen surfaces ----
  if (screen === "settings") return <Settings onClose={() => setScreen("home")} />;
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
      />
    );
  if (screen === "writeCode")
    return (
      <Center>
        <Text style={styles.h2}>Write this on the item</Text>
        <Text style={styles.bigCode}>{draft.itemCode}</Text>
        <View style={{ height: 20 }} />
        <PrimaryButton title="Done — take photo ▶" onPress={() => setScreen("photo")} style={{ alignSelf: "stretch" }} />
        <View style={{ height: 10 }} />
        <SecondaryButton title="Cancel" onPress={() => { edit({ itemCode: "" }); setScreen("home"); }} />
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

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.appName}>Moverse</Text>
        <TouchableOpacity onPress={() => setScreen("settings")} hitSlop={12}>
          <Ionicons name="settings-outline" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.banner, boxOk ? styles.bannerOk : styles.bannerWarn]}
        onPress={() => setScreen("setBox")}
        activeOpacity={0.8}
      >
        <Text style={styles.bannerText}>
          {boxOk ? `📦 Packing into ${draft.boxCode.trim()}` : "📦 No box — tap to set"}
        </Text>
        <Text style={styles.bannerAction}>{boxOk ? "Change" : "Set"}</Text>
      </TouchableOpacity>
      <Text style={[styles.status, toast ? styles.statusToast : styles.statusIdle]}>
        {toast || (count > 0 ? `${count} packed` : "Ready")}
      </Text>

      <ScrollView contentContainerStyle={styles.body2} keyboardShouldPersistTaps="handled">
        <FieldLabel text="Photo" done={draft.photoUri !== ""} />
        <View style={styles.photoRow}>
          {draft.photoUri ? (
            <Image source={{ uri: draft.photoUri }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <Text style={styles.thumbEmptyText}>No photo</Text>
            </View>
          )}
          <View style={styles.rightCol}>
            <SecondaryButton
              title={draft.photoUri ? "Retake" : "Take photo"}
              onPress={() => setScreen("photo")}
              style={styles.fixedBtn}
            />
          </View>
        </View>

        {mode !== "none" ? (
          <>
            <FieldLabel text="Item code" done={itemOk} />
            {mode === "assign" ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{draft.itemCode || "— assigned when you add"}</Text>
              </View>
            ) : (
              <>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.flex, itemBad && styles.inputBad]}
                    value={draft.itemCode}
                    onChangeText={(t) => edit({ itemCode: t })}
                    placeholder={`${ITEM_PREFIX}0001`}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <View style={{ width: 8 }} />
                  <SecondaryButton title="Scan" onPress={() => setScreen("scanItem")} style={styles.fixedBtn} />
                </View>
                {itemBad ? <Text style={styles.warn}>Expected an {ITEM_PREFIX} code</Text> : null}
              </>
            )}
          </>
        ) : null}

        <FieldLabel text="Description / notes" done={descOk} />
        <TextInput
          style={[styles.input, styles.multiline]}
          value={draft.description}
          onChangeText={(t) => edit({ description: t })}
          placeholder="Describe the item, or add a note…"
          multiline
        />
        <View style={styles.aiRow}>
          <SecondaryButton
            title="✨ Auto-describe"
            onPress={() => autoDescribe(draft.photoBase64)}
            disabled={!draft.photoBase64 || describeState === "loading"}
          />
          {describeState !== "idle" ? (
            <Text style={styles.aiState} numberOfLines={2}>
              {describeState === "loading"
                ? "Describing…"
                : describeState === "off"
                  ? "AI off — type it in"
                  : "Suggestion added — edit if needed"}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        {draftEmpty ? (
          <PrimaryButton
            title={busy ? "…" : "＋ Add item"}
            onPress={startAdd}
            disabled={busy || !boxOk}
            style={styles.flex}
          />
        ) : (
          <PrimaryButton
            title={saving ? "Saving…" : boxOk ? `Save → ${draft.boxCode.trim()}` : "Save"}
            onPress={doSave}
            disabled={!canSave}
            style={styles.flex}
          />
        )}
      </View>
      <StatusBar style="dark" />
    </View>
  );
}

function Onboarding({ onPick }: { onPick: (m: LabelingMode) => void }) {
  const cards: { m: LabelingMode; icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }[] = [
    { m: "assign", icon: "print-outline", title: "I have a label printer", sub: "The app assigns & prints a code per item (or shows it to hand-write)." },
    { m: "scan", icon: "qr-code-outline", title: "Pre-printed sticker sheets", sub: "You stick labels, then scan each one while packing." },
    { m: "none", icon: "camera-outline", title: "Neither — just name boxes", sub: "Name a box and photograph items. No codes." },
  ];
  return (
    <View style={styles.center}>
      <Text style={styles.h1}>How do you label items?</Text>
      <Text style={styles.body}>You can change this anytime in Settings.</Text>
      <View style={{ height: 16 }} />
      {cards.map((c) => (
        <TouchableOpacity key={c.m} style={styles.onCard} onPress={() => onPick(c.m)} activeOpacity={0.85}>
          <Ionicons name={c.icon} size={28} color="#111" />
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text style={styles.onTitle}>{c.title}</Text>
            <Text style={styles.onSub}>{c.sub}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function SetBox({
  onSet,
  onScan,
  onCancel,
}: {
  onSet: (code: string) => void;
  onScan: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <View style={styles.center}>
      <Text style={styles.h2}>Which box?</Text>
      <Text style={styles.body}>Scan a BOX-… label, or type a name.</Text>
      <View style={{ height: 16 }} />
      <TextInput
        style={[styles.input, { alignSelf: "stretch" }]}
        value={text}
        onChangeText={setText}
        placeholder="e.g. BOX-0007 or Kitchen"
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <View style={{ height: 12 }} />
      <PrimaryButton
        title="Set box"
        onPress={() => onSet(text)}
        disabled={text.trim() === ""}
        style={{ alignSelf: "stretch" }}
      />
      <View style={{ height: 10 }} />
      <SecondaryButton title="Scan a box label" onPress={onScan} />
      <View style={{ height: 10 }} />
      <SecondaryButton title="Cancel" onPress={onCancel} />
    </View>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View style={styles.center}>{children}</View>;
}
function FieldLabel({ text, done }: { text: string; done: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {text}
      {done ? "  ✓" : ""}
    </Text>
  );
}
function PrimaryButton({
  title,
  onPress,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: object;
}) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, disabled && styles.btnDisabled, style]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.primaryBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}
function SecondaryButton({
  title,
  onPress,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: object;
}) {
  return (
    <TouchableOpacity
      style={[styles.secondaryBtn, disabled && styles.btnDisabled, style]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.secondaryBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

const MIN_TAP = 48;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff", paddingTop: 44 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  appName: { fontSize: 20, fontWeight: "800", color: "#111" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  h1: { fontSize: 24, fontWeight: "800", textAlign: "center", marginBottom: 6 },
  h2: { fontSize: 22, fontWeight: "700", textAlign: "center", marginVertical: 8 },
  bigCode: { fontSize: 40, fontWeight: "900", letterSpacing: 2, color: "#111" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  bannerOk: { backgroundColor: "#111827" },
  bannerWarn: { backgroundColor: "#8a1c1c" },
  bannerText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  bannerAction: { color: "#9fb3d1", fontSize: 14, fontWeight: "700" },
  status: { fontWeight: "600", marginTop: 8, marginBottom: 4, marginHorizontal: 16 },
  statusToast: { color: "#1b7a3d" },
  statusIdle: { color: "#888" },
  body2: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  flex: { flex: 1 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#555",
    marginTop: 16,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  photoRow: { flexDirection: "row", alignItems: "center" },
  rightCol: { flex: 1, marginLeft: 12, alignItems: "flex-end" },
  thumb: { width: 84, height: 84, borderRadius: 10, backgroundColor: "#e5e5e5" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  thumbEmptyText: { color: "#666", fontSize: 12 },
  chip: {
    alignSelf: "flex-start",
    backgroundColor: "#eef1f5",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  chipText: { fontSize: 16, fontWeight: "700", color: "#111" },
  inputRow: { flexDirection: "row", alignItems: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: MIN_TAP,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  multiline: { minHeight: 72, paddingTop: 12, paddingBottom: 12, textAlignVertical: "top" },
  inputBad: { borderColor: "#b45309", backgroundColor: "#fff7ed" },
  warn: { color: "#b45309", fontSize: 13, marginTop: 4, fontWeight: "600" },
  aiRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  aiState: { color: "#555", fontSize: 13, flex: 1, marginLeft: 12 },
  body: { fontSize: 15, color: "#333", textAlign: "center", marginVertical: 2 },
  fixedBtn: { minWidth: 132 },
  onCard: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  onTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  onSub: { fontSize: 13, color: "#666", marginTop: 3 },
  primaryBtn: {
    backgroundColor: "#111",
    minHeight: 56,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  secondaryBtn: {
    backgroundColor: "#eee",
    minHeight: MIN_TAP,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: "#111", fontSize: 15, fontWeight: "600" },
  btnDisabled: { opacity: 0.35 },
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ddd",
    backgroundColor: "#fff",
  },
});
