import React, { useRef, useState } from "react";
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
import { useCameraPermissions } from "expo-camera";
import Scanner from "./src/Scanner";
import Capture, { type CaptureResult } from "./src/Capture";
import { describe, save } from "./src/api";
import { classify } from "./src/labels";
import { ITEM_PREFIX, BOX_PREFIX } from "./src/config";
import { buzzOk, buzzErr } from "./src/haptics";

// The in-progress item. Any field can be filled or corrected in any order.
interface Draft {
  itemCode: string;
  boxCode: string;
  description: string;
  photoUri: string;
  photoBase64: string;
}
const EMPTY: Draft = { itemCode: "", boxCode: "", description: "", photoUri: "", photoBase64: "" };

// Full-screen camera surfaces; "home" is the hub.
//  capture  = continuous scan-item -> photo
//  photo    = retake photo only
//  scanItem = re-scan the item code only
//  scanBox  = set / change the locked box
type Mode = "home" | "capture" | "photo" | "scanItem" | "scanBox";
type DescribeState = "idle" | "loading" | "off" | "done";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();

  const [mode, setMode] = useState<Mode>("home");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [describeState, setDescribeState] = useState<DescribeState>("idle");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [count, setCount] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function edit(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }
  // Transient confirmation — shows briefly then clears itself so nothing sits
  // on screen forever.
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
      } else {
        setDescribeState("off");
      }
    } catch {
      // /describe needs the Anthropic key on the backend; type it in instead.
      setDescribeState("off");
    }
  }

  function onCaptureDone(r: CaptureResult) {
    const patch: Partial<Draft> = { photoUri: r.photoUri, photoBase64: r.photoBase64 };
    if (r.itemCode) patch.itemCode = r.itemCode;
    edit(patch);
    setMode("home");
    void autoDescribe(r.photoBase64);
  }

  function onScanBox(code: string) {
    const prev = draft.boxCode.trim();
    if (prev && prev !== code) {
      setMode("home");
      Alert.alert("Switch box?", `Now packing into ${code} instead of ${prev}?`, [
        { text: "Keep " + prev, style: "cancel" },
        { text: "Switch", onPress: () => edit({ boxCode: code }) },
      ]);
    } else {
      edit({ boxCode: code });
      setMode("home");
    }
  }

  async function doSave() {
    const code = draft.itemCode.trim();
    const box = draft.boxCode.trim();
    setSaving(true);
    try {
      const res = await save({
        itemCode: code,
        boxCode: box,
        description: draft.description.trim(),
        imageBase64: draft.photoBase64,
      });
      buzzOk();
      // One record per item; an item can be unioned into multiple boxes.
      showToast(
        res.action === "exists"
          ? `${code} already in ${box}`
          : res.action === "added"
            ? `Added ${code} → ${box} ✓`
            : `Saved ${code} → ${box} ✓`,
      );
      if (res.action !== "exists") setCount((c) => c + 1);
      // Keep the locked box for the next item; reset the rest.
      setDraft({ ...EMPTY, boxCode: draft.boxCode });
      setDescribeState("idle");
    } catch (e) {
      buzzErr();
      Alert.alert("Save failed", String(e) + "\nYour entry is kept — try again.");
    } finally {
      setSaving(false);
    }
  }

  // ---- permission gate ----
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

  // ---- camera surfaces ----
  if (mode === "capture") {
    return <Capture startPhase="item" onDone={onCaptureDone} onCancel={() => setMode("home")} />;
  }
  if (mode === "photo") {
    return (
      <Capture
        startPhase="photo"
        itemCode={draft.itemCode}
        onDone={onCaptureDone}
        onCancel={() => setMode("home")}
      />
    );
  }
  if (mode === "scanItem") {
    return (
      <Scanner
        expect="item"
        prompt="Scan the item's QR label (ITM-…)"
        onScan={(code) => {
          edit({ itemCode: code });
          setMode("home");
        }}
        onReject={(m) => Alert.alert("Wrong label", m)}
        onCancel={() => setMode("home")}
      />
    );
  }
  if (mode === "scanBox") {
    return (
      <Scanner
        expect="box"
        prompt="Scan the box/suitcase QR label (BOX-…)"
        onScan={onScanBox}
        onReject={(m) => Alert.alert("Wrong label", m)}
        onCancel={() => setMode("home")}
      />
    );
  }

  // ---- the home hub ----
  const itemBad = draft.itemCode.trim() !== "" && classify(draft.itemCode) !== "item";
  const itemOk = draft.itemCode.trim() !== "" && !itemBad;
  const boxBad = draft.boxCode.trim() !== "" && classify(draft.boxCode) !== "box";
  const boxOk = draft.boxCode.trim() !== "" && !boxBad;
  const draftEmpty = draft.itemCode.trim() === "" && draft.photoUri === "";
  const canSave = !saving && itemOk && boxOk;

  return (
    <View style={styles.screen}>
      {/* TOP: box-lock banner + transient status */}
      <TouchableOpacity
        style={[styles.banner, boxOk ? styles.bannerOk : styles.bannerWarn]}
        onPress={() => setMode("scanBox")}
        activeOpacity={0.8}
      >
        <Text style={styles.bannerText}>
          {boxOk ? `📦 Packing into ${draft.boxCode.trim()}` : "📦 No box — tap to scan"}
        </Text>
        <Text style={styles.bannerAction}>{boxOk ? "Change" : "Scan"}</Text>
      </TouchableOpacity>
      <Text style={[styles.status, toast ? styles.statusToast : styles.statusIdle]}>
        {toast || (count > 0 ? `${count} packed` : "Ready")}
      </Text>

      {/* MIDDLE: correction / exception surface */}
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
              onPress={() => setMode("photo")}
              style={styles.fixedBtn}
            />
          </View>
        </View>

        <FieldLabel text="Item code" done={itemOk} />
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
          <SecondaryButton title="Scan" onPress={() => setMode("scanItem")} style={styles.fixedBtn} />
        </View>
        {itemBad ? <Text style={styles.warn}>Expected an {ITEM_PREFIX} code</Text> : null}

        <FieldLabel text="Description / notes" done={draft.description.trim() !== ""} />
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

      {/* BOTTOM: fixed action bar (outside the scroll) */}
      <View style={styles.actionBar}>
        {draftEmpty ? (
          <PrimaryButton title="Scan item ▶" onPress={() => setMode("capture")} style={styles.flex} />
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
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
  // Shared width for the Photo/Scan secondary actions so they match and their
  // right edges line up against the margin.
  fixedBtn: { minWidth: 132 },
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
