import React, { useRef, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CameraView, type CameraView as CameraViewType } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import { classify } from "./labels";
import { buzzOk, buzzErr, tap } from "./haptics";

export interface CaptureResult {
  itemCode?: string; // set only when this capture scanned an item
  photoUri: string;
  photoBase64: string;
}

interface Props {
  // "item" chains scan-item -> photo in one mounted camera; "photo" retakes
  // the photo only (item code already known).
  startPhase: "item" | "photo";
  itemCode?: string;
  onDone: (r: CaptureResult) => void;
  onCancel: () => void;
}

/**
 * One continuously-mounted CameraView that flips from QR scanning to photo
 * capture without a remount — so the scan -> photo hand-off has no camera
 * cold-restart. onBarcodeScanned is only wired during the "item" phase.
 */
export default function Capture({ startPhase, itemCode, onDone, onCancel }: Props) {
  const [phase, setPhase] = useState<"item" | "photo">(startPhase);
  const [code, setCode] = useState(itemCode ?? "");
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const camRef = useRef<CameraViewType>(null);
  const locked = useRef(false);

  function handleBarcode(value: string) {
    if (locked.current) return;
    locked.current = true;
    setTimeout(() => (locked.current = false), 1200);
    if (classify(value) === "item") {
      buzzOk();
      setCode(value.trim());
      setPhase("photo");
    } else {
      buzzErr();
      Alert.alert("Wrong label", "Scan the item's QR label (ITM-…).");
    }
  }

  async function takePhoto() {
    const cam = camRef.current;
    if (!cam) return;
    setBusy(true);
    try {
      const shot = await cam.takePictureAsync({ quality: 0.8 });
      if (!shot?.uri) throw new Error("no photo");
      const out = await ImageManipulator.manipulateAsync(
        shot.uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      tap();
      onDone({
        itemCode: startPhase === "item" ? code : undefined,
        photoUri: out.uri,
        photoBase64: out.base64 ?? "",
      });
    } catch (e) {
      buzzErr();
      Alert.alert("Camera error", String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.fill}>
      <CameraView
        ref={camRef}
        style={styles.fill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        // Only scan during the item phase; undefined disables scanning for photo.
        onBarcodeScanned={phase === "item" ? ({ data }) => handleBarcode(data) : undefined}
      />

      {/* top controls */}
      <View style={styles.topBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.chip} onPress={onCancel} accessibilityLabel="Cancel">
          <Ionicons name="close" size={18} color="#fff" />
          <Text style={styles.chipText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, torch && styles.chipOn]}
          onPress={() => setTorch((v) => !v)}
          accessibilityLabel="Toggle torch"
        >
          <Ionicons name={torch ? "flashlight" : "flashlight-outline"} size={18} color="#fff" />
          <Text style={styles.chipText}>Torch</Text>
        </TouchableOpacity>
      </View>

      {phase === "item" ? (
        <View style={styles.centerOverlay} pointerEvents="none">
          <View style={styles.reticle} />
          <Text style={styles.prompt}>Scan the item's QR label (ITM-…)</Text>
        </View>
      ) : (
        <View style={styles.bottomBar}>
          <Text style={styles.barLabel}>{code ? `Item ${code}` : "Photograph the item"}</Text>
          <TouchableOpacity style={styles.shutter} onPress={takePhoto} disabled={busy} />
          <Text style={styles.barHint}>Tap to photograph</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  topBar: {
    position: "absolute",
    top: 44,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.6)",
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  chipOn: { backgroundColor: "rgba(4,120,87,0.85)" },
  chipText: { color: "#fff", fontSize: 15, fontWeight: "600", marginLeft: 6 },
  centerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  reticle: {
    width: 220,
    height: 220,
    borderWidth: 3,
    borderColor: "#fff",
    borderRadius: 16,
    backgroundColor: "transparent",
  },
  prompt: {
    marginTop: 24,
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 24,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingVertical: 28,
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
