import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
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

type Step =
  | "scanItem"
  | "photo"
  | "describe"
  | "assignBox"
  | "confirm"
  | "saving"
  | "done";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();

  const [step, setStep] = useState<Step>("scanItem");
  const [itemCode, setItemCode] = useState("");
  const [photoBase64, setPhotoBase64] = useState("");
  const [photoUri, setPhotoUri] = useState("");
  const [description, setDescription] = useState("");
  const [boxCode, setBoxCode] = useState("");
  const [busy, setBusy] = useState(false);

  const cameraRef = useRef<CameraViewType>(null);

  function resetForNext() {
    setItemCode("");
    setPhotoBase64("");
    setPhotoUri("");
    setDescription("");
    setBoxCode("");
    setStep("scanItem");
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
        <Button title="Grant camera access" onPress={requestPermission} />
      </Center>
    );
  }

  // ---- step: scan the item label ----
  if (step === "scanItem") {
    return (
      <Scanner
        expect="item"
        prompt="Scan the item's QR label (ITM-…)"
        onScan={(code) => {
          setItemCode(code);
          setStep("photo");
        }}
        onReject={(m) => Alert.alert("Wrong label", m)}
      />
    );
  }

  // ---- step: take a photo ----
  if (step === "photo") {
    async function takePhoto() {
      const cam = cameraRef.current;
      if (!cam) return;
      setBusy(true);
      try {
        const shot = await cam.takePictureAsync({ quality: 0.8 });
        if (!shot?.uri) throw new Error("no photo");
        // downscale to ~1024px long edge + JPEG compress, get base64
        const out = await ImageManipulator.manipulateAsync(
          shot.uri,
          [{ resize: { width: 1024 } }],
          {
            compress: 0.6,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          },
        );
        setPhotoUri(out.uri);
        setPhotoBase64(out.base64 ?? "");
        // kick off description immediately
        setStep("describe");
        void generateDescription(out.base64 ?? "");
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
          <Text style={styles.barLabel}>Item {itemCode}</Text>
          <TouchableOpacity
            style={styles.shutter}
            onPress={takePhoto}
            disabled={busy}
          />
          <Text style={styles.barHint}>Tap to photograph the item</Text>
        </View>
        <StatusBar style="light" />
      </View>
    );
  }

  async function generateDescription(b64: string) {
    setBusy(true);
    try {
      const text = await describe(b64);
      setDescription(text);
    } catch {
      // leave empty; user can type it in manually
      setDescription("");
    } finally {
      setBusy(false);
    }
  }

  // ---- step: confirm/edit the description ----
  if (step === "describe") {
    return (
      <Center>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.preview} />
        ) : null}
        <Text style={styles.h2}>What is this?</Text>
        {busy ? (
          <ActivityIndicator style={{ marginVertical: 12 }} />
        ) : (
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the item…"
            multiline
          />
        )}
        <View style={styles.row}>
          <Button title="Retake" onPress={() => setStep("photo")} />
          <View style={{ width: 12 }} />
          <Button
            title="Regenerate"
            onPress={() => generateDescription(photoBase64)}
            disabled={busy || !photoBase64}
          />
        </View>
        <View style={{ height: 12 }} />
        <Button
          title="Next: assign box"
          onPress={() => setStep("assignBox")}
          disabled={busy || description.trim().length === 0}
        />
      </Center>
    );
  }

  // ---- step: scan the destination box ----
  if (step === "assignBox") {
    return (
      <Scanner
        expect="box"
        prompt="Scan the box/suitcase QR label (BOX-…)"
        onScan={(code) => {
          setBoxCode(code);
          setStep("confirm");
        }}
        onReject={(m) => Alert.alert("Wrong label", m)}
      />
    );
  }

  // ---- step: confirm & save ----
  if (step === "confirm" || step === "saving") {
    async function doSave() {
      setStep("saving");
      try {
        await save({ itemCode, boxCode, description: description.trim(), imageBase64: photoBase64 });
        setStep("done");
      } catch (e) {
        Alert.alert("Save failed", String(e) + "\nYour entry is kept — try again.");
        setStep("confirm");
      }
    }

    return (
      <Center>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.preview} />
        ) : null}
        <Text style={styles.h2}>{description}</Text>
        <Text style={styles.body}>Item {itemCode}</Text>
        <Text style={styles.body}>→ Box {boxCode}</Text>
        <View style={{ height: 16 }} />
        {step === "saving" ? (
          <ActivityIndicator />
        ) : (
          <>
            <Button title="Save item" onPress={doSave} />
            <View style={{ height: 8 }} />
            <Button title="Change box" onPress={() => setStep("assignBox")} />
          </>
        )}
      </Center>
    );
  }

  // ---- step: done ----
  return (
    <Center>
      <Text style={styles.h2}>Saved ✓</Text>
      <Text style={styles.body}>{description}</Text>
      <View style={{ height: 16 }} />
      <Button title="Pack next item" onPress={resetForNext} />
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View style={styles.center}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  row: { flexDirection: "row", marginTop: 16, alignItems: "center" },
  h2: { fontSize: 22, fontWeight: "700", textAlign: "center", marginVertical: 8 },
  body: { fontSize: 15, color: "#333", textAlign: "center", marginVertical: 2 },
  input: {
    width: "100%",
    minHeight: 60,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginVertical: 8,
  },
  preview: { width: 200, height: 200, borderRadius: 12, marginBottom: 12 },
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
