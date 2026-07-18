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
import {
  CameraView,
  useCameraPermissions,
  type CameraView as CameraViewType,
} from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import Scanner from "./src/Scanner";
import { describe, save } from "./src/api";
import { classify } from "./src/labels";
import { ITEM_PREFIX, BOX_PREFIX } from "./src/config";

// The in-progress item. Everything lives here so any field can be filled or
// corrected in any order — by scanning or by typing.
interface Draft {
  itemCode: string;
  boxCode: string;
  description: string;
  photoUri: string;
  photoBase64: string;
}

const EMPTY: Draft = {
  itemCode: "",
  boxCode: "",
  description: "",
  photoUri: "",
  photoBase64: "",
};

// Full-screen overlays; "home" is the editable hub.
type Mode = "home" | "scanItem" | "scanBox" | "photo";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();

  const [mode, setMode] = useState<Mode>("home");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [past, setPast] = useState<Draft[]>([]);
  const [future, setFuture] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState("");

  const cameraRef = useRef<CameraViewType>(null);

  // Snapshot-based edit for discrete actions (scans, photo, auto-describe,
  // clear) so Undo/Redo can walk them. Free-text typing edits the draft
  // directly and is not pushed onto the history.
  function commit(patch: Partial<Draft>) {
    setPast((p) => [...p, draft].slice(-40));
    setFuture([]);
    setDraft((d) => ({ ...d, ...patch }));
  }
  function edit(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }
  function undo() {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setFuture((f) => [draft, ...f].slice(0, 40));
    setDraft(prev);
    setPast((p) => p.slice(0, -1));
  }
  function redo() {
    if (future.length === 0) return;
    const next = future[0];
    setPast((p) => [...p, draft].slice(-40));
    setDraft(next);
    setFuture((f) => f.slice(1));
  }

  function clearDraft() {
    commit(EMPTY);
    setLastSaved("");
  }

  async function autoDescribe(b64: string) {
    if (!b64) return;
    setBusy(true);
    try {
      const text = await describe(b64);
      // Direct set (not commit) so it doesn't clobber the undo stack mid-typing;
      // the photo capture that triggered it is already an undo point.
      setDraft((d) => ({ ...d, description: text }));
    } catch {
      // Leave whatever is there; user can type it in. (/describe needs the
      // Anthropic key set on the backend.)
    } finally {
      setBusy(false);
    }
  }

  async function doSave() {
    setSaving(true);
    try {
      await save({
        itemCode: draft.itemCode.trim(),
        boxCode: draft.boxCode.trim(),
        description: draft.description.trim(),
        imageBase64: draft.photoBase64,
      });
      setLastSaved(`${draft.itemCode.trim()} → ${draft.boxCode.trim()}`);
      // Keep the box so the next item can go into the same box quickly; clear
      // the rest. This is a fresh draft, so reset history too.
      const keepBox = draft.boxCode;
      setDraft({ ...EMPTY, boxCode: keepBox });
      setPast([]);
      setFuture([]);
    } catch (e) {
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

  // ---- overlay: scan the item label ----
  if (mode === "scanItem") {
    return (
      <Scanner
        expect="item"
        prompt="Scan the item's QR label (ITM-…)"
        onScan={(code) => {
          commit({ itemCode: code });
          setMode("home");
        }}
        onReject={(m) => Alert.alert("Wrong label", m)}
      />
    );
  }

  // ---- overlay: scan the destination box ----
  if (mode === "scanBox") {
    return (
      <Scanner
        expect="box"
        prompt="Scan the box/suitcase QR label (BOX-…)"
        onScan={(code) => {
          commit({ boxCode: code });
          setMode("home");
        }}
        onReject={(m) => Alert.alert("Wrong label", m)}
      />
    );
  }

  // ---- overlay: take a photo ----
  if (mode === "photo") {
    async function takePhoto() {
      const cam = cameraRef.current;
      if (!cam) return;
      setBusy(true);
      try {
        const shot = await cam.takePictureAsync({ quality: 0.8 });
        if (!shot?.uri) throw new Error("no photo");
        const out = await ImageManipulator.manipulateAsync(
          shot.uri,
          [{ resize: { width: 1024 } }],
          {
            compress: 0.6,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          },
        );
        commit({ photoUri: out.uri, photoBase64: out.base64 ?? "" });
        setMode("home");
        void autoDescribe(out.base64 ?? "");
      } catch (e) {
        Alert.alert("Camera error", String(e));
      } finally {
        setBusy(false);
      }
    }

    return (
      <View style={styles.fill}>
        <CameraView ref={cameraRef} style={styles.fill} facing="back" />
        <View style={styles.bottomBar}>
          <Text style={styles.barLabel}>
            {draft.itemCode ? `Item ${draft.itemCode}` : "New item"}
          </Text>
          <TouchableOpacity
            style={styles.shutter}
            onPress={takePhoto}
            disabled={busy}
          />
          <TouchableOpacity onPress={() => setMode("home")}>
            <Text style={styles.barHint}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <StatusBar style="light" />
      </View>
    );
  }

  // ---- the home hub ----
  const itemBad = draft.itemCode.trim() !== "" && classify(draft.itemCode) !== "item";
  const boxBad = draft.boxCode.trim() !== "" && classify(draft.boxCode) !== "box";
  const canSave =
    !saving && draft.itemCode.trim() !== "" && draft.boxCode.trim() !== "";

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.hubContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Moverse</Text>
          <View style={styles.row}>
            <SmallButton title="↶ Undo" onPress={undo} disabled={past.length === 0} />
            <View style={{ width: 8 }} />
            <SmallButton title="↷ Redo" onPress={redo} disabled={future.length === 0} />
          </View>
        </View>

        {lastSaved ? <Text style={styles.saved}>Saved {lastSaved} ✓</Text> : null}

        {/* Photo */}
        <Text style={styles.fieldLabel}>Photo</Text>
        <View style={styles.photoRow}>
          {draft.photoUri ? (
            <Image source={{ uri: draft.photoUri }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <Text style={styles.thumbEmptyText}>No photo</Text>
            </View>
          )}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <PrimaryButton
              title={draft.photoUri ? "Retake photo" : "Take photo"}
              onPress={() => setMode("photo")}
            />
          </View>
        </View>

        {/* Item */}
        <Text style={styles.fieldLabel}>Item code</Text>
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
          <SmallButton title="Scan" onPress={() => setMode("scanItem")} />
        </View>
        {itemBad ? <Text style={styles.warn}>Expected an {ITEM_PREFIX} code</Text> : null}

        {/* Description / notes */}
        <Text style={styles.fieldLabel}>Description / notes</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.flex, { minHeight: 64 }]}
            value={draft.description}
            onChangeText={(t) => edit({ description: t })}
            placeholder="Describe the item, or add a note…"
            multiline
          />
        </View>
        <View style={styles.row}>
          {busy ? (
            <ActivityIndicator />
          ) : (
            <SmallButton
              title="✨ Auto-describe"
              onPress={() => autoDescribe(draft.photoBase64)}
              disabled={!draft.photoBase64}
            />
          )}
        </View>

        {/* Box */}
        <Text style={styles.fieldLabel}>Box / suitcase</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.flex, boxBad && styles.inputBad]}
            value={draft.boxCode}
            onChangeText={(t) => edit({ boxCode: t })}
            placeholder={`${BOX_PREFIX}0001`}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <View style={{ width: 8 }} />
          <SmallButton title="Scan" onPress={() => setMode("scanBox")} />
        </View>
        {boxBad ? <Text style={styles.warn}>Expected a {BOX_PREFIX} code</Text> : null}

        <View style={{ height: 20 }} />
        <PrimaryButton
          title={saving ? "Saving…" : "Save item"}
          onPress={doSave}
          disabled={!canSave}
        />
        <View style={{ height: 10 }} />
        <SmallButton title="Clear / new item" onPress={clearDraft} />
      </ScrollView>
      <StatusBar style="dark" />
    </View>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View style={styles.center}>{children}</View>;
}

function PrimaryButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.primaryBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

function SmallButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.smallBtn, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.smallBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  screen: { flex: 1, backgroundColor: "#fff" },
  hubContent: { padding: 20, paddingTop: 56, paddingBottom: 48 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { fontSize: 28, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center" },
  flex: { flex: 1 },
  saved: {
    backgroundColor: "#e7f6ec",
    color: "#1b7a3d",
    fontWeight: "600",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
    overflow: "hidden",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#666",
    marginTop: 16,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  photoRow: { flexDirection: "row", alignItems: "center" },
  thumb: { width: 84, height: 84, borderRadius: 10, backgroundColor: "#eee" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  thumbEmptyText: { color: "#999", fontSize: 12 },
  inputRow: { flexDirection: "row", alignItems: "flex-start" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  inputBad: { borderColor: "#e0a800", backgroundColor: "#fffaf0" },
  warn: { color: "#b8860b", fontSize: 12, marginTop: 4 },
  body: { fontSize: 15, color: "#333", textAlign: "center", marginVertical: 2 },
  primaryBtn: {
    backgroundColor: "#111",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  smallBtn: {
    backgroundColor: "#eee",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  smallBtnText: { color: "#111", fontSize: 14, fontWeight: "600" },
  btnDisabled: { opacity: 0.4 },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingVertical: 24,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  barLabel: { color: "#fff", marginBottom: 12, fontWeight: "600" },
  barHint: { color: "#eee", marginTop: 12 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fff",
    borderWidth: 4,
    borderColor: "#bbb",
  },
});
