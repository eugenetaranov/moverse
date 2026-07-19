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
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import Scanner from "../Scanner";
import Capture, { type CaptureResult } from "../Capture";
import Settings from "../Settings";
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
import { DEFAULT_LABEL, LabelSize, loadLabelSize } from "../labelSettings";
import { printer } from "../niimbot/connection";
import { renderLabel } from "../niimbot/label";
import { reserveCode, seedReservation } from "../reservation";
import { colors, radius, space, type as t, HIT } from "../theme";
import { PrimaryButton, SecondaryButton, FieldLabel, Center, type IconName } from "../ui";
import type { RootTabParamList } from "../navTypes";

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

export default function Pack() {
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList, "Pack">>();
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
  useEffect(() => {
    if (screen === "home") {
      loadMode().then(setModeState);
      loadLabelSize().then(setLabelSize);
    }
  }, [screen]);

  // Full-screen surfaces (camera, onboarding, permission gate) should own the
  // whole screen, so hide the bottom tab bar while any of them is showing.
  useEffect(() => {
    const immersive = !onboarded || !permission?.granted || screen !== "home";
    navigation.setOptions({ tabBarStyle: immersive ? { display: "none" } : undefined });
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
            ? `Added ${shown} → ${box}`
            : `Saved ${shown} → ${box}`,
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
        <PrimaryButton title="Grant camera access" onPress={requestPermission} icon="camera" />
      </Center>
    );

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
      <SetBox onSet={applyBox} onScan={() => setScreen("scanBox")} onCancel={() => setScreen("home")} />
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
          style={{ alignSelf: "stretch" }}
        />
        <View style={{ height: space.sm }} />
        <SecondaryButton
          title="Cancel"
          onPress={() => {
            edit({ itemCode: "" });
            setScreen("home");
          }}
        />
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
        <TouchableOpacity
          onPress={() => setScreen("settings")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={24} color={colors.mutedFg} />
        </TouchableOpacity>
      </View>

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

        {mode !== "none" ? (
          <>
            <FieldLabel text="Item code" done={itemOk} />
            {mode === "assign" ? (
              <View style={styles.chip}>
                <Ionicons name="pricetag-outline" size={16} color={colors.mutedFg} />
                <Text style={styles.chipText}>{draft.itemCode || "assigned when you add"}</Text>
              </View>
            ) : (
              <>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.flex, itemBad && styles.inputBad]}
                    value={draft.itemCode}
                    onChangeText={(v) => edit({ itemCode: v })}
                    placeholder={`${ITEM_PREFIX}0001`}
                    placeholderTextColor={colors.mutedFg}
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
            )}
          </>
        ) : null}

        <FieldLabel text="Description / notes" done={descOk} />
        <TextInput
          style={[styles.input, styles.multiline]}
          value={draft.description}
          onChangeText={(v) => edit({ description: v })}
          placeholder="Describe the item, or add a note…"
          placeholderTextColor={colors.mutedFg}
          multiline
        />
        <View style={styles.aiRow}>
          <SecondaryButton
            title="Auto-describe"
            icon="sparkles-outline"
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
      {cards.map((c) => (
        <TouchableOpacity key={c.m} style={styles.onCard} onPress={() => onPick(c.m)} activeOpacity={0.85}>
          <View style={styles.onIcon}>
            <Ionicons name={c.icon} size={24} color={colors.primary} />
          </View>
          <View style={{ marginLeft: space.md, flex: 1 }}>
            <Text style={styles.onTitle}>{c.title}</Text>
            <Text style={styles.onSub}>{c.sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedFg} />
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
      <Ionicons name="cube-outline" size={40} color={colors.primary} />
      <Text style={styles.h2}>Which box?</Text>
      <Text style={styles.bodyCenter}>Scan a BOX-… label, or type a name.</Text>
      <View style={{ height: space.lg }} />
      <TextInput
        style={[styles.input, { alignSelf: "stretch" }]}
        value={text}
        onChangeText={setText}
        placeholder="e.g. BOX-0007 or Kitchen"
        placeholderTextColor={colors.mutedFg}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <View style={{ height: space.md }} />
      <PrimaryButton title="Set box" onPress={() => onSet(text)} disabled={text.trim() === ""} style={{ alignSelf: "stretch" }} />
      <View style={{ height: space.sm }} />
      <SecondaryButton title="Scan a box label" icon="qr-code-outline" onPress={onScan} />
      <View style={{ height: space.sm }} />
      <SecondaryButton title="Cancel" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  appName: { ...t.h2, color: colors.fg },
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
  aiRow: { flexDirection: "row", alignItems: "center", marginTop: space.sm },
  aiState: { ...t.caption, color: colors.mutedFg, flex: 1, marginLeft: space.md },
  bodyCenter: { ...t.body, color: colors.mutedFg, textAlign: "center" },
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
});
