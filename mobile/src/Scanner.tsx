import React, { useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CameraView } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { classify, LabelKind } from "./labels";
import { buzzOk, buzzErr } from "./haptics";

interface Props {
  expect: "item" | "box";
  prompt: string;
  onScan: (code: string) => void;
  onReject: (message: string) => void;
  onCancel: () => void;
}

/**
 * Standalone QR scanner for one-off (re)scans of an item or box code. Validates
 * against the expected kind and only calls onScan for a match; a ref lock stops
 * a single frame from firing repeatedly. Has a reachable Cancel to back out.
 */
export default function Scanner({ expect, prompt, onScan, onReject, onCancel }: Props) {
  const locked = useRef(false);

  function handleBarcode(code: string) {
    if (locked.current) return;
    locked.current = true;
    setTimeout(() => (locked.current = false), 1200);

    const kind: LabelKind = classify(code);
    if (kind === expect) {
      buzzOk();
      onScan(code.trim());
    } else if (kind === "unknown") {
      buzzErr();
      onReject("Unrecognized label — expected an " + expect + " code.");
    } else {
      buzzErr();
      onReject(`That's a ${kind} label; a ${expect} label is expected here.`);
    }
  }

  return (
    <View style={styles.fill}>
      <CameraView
        style={styles.fill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => handleBarcode(data)}
      />
      <View style={styles.topBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.chip} onPress={onCancel} accessibilityLabel="Cancel">
          <Ionicons name="close" size={18} color="#fff" />
          <Text style={styles.chipText}>Cancel</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.reticle} />
        <Text style={styles.prompt}>{prompt}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  topBar: { position: "absolute", top: 44, left: 0, right: 0, paddingHorizontal: 16 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(15,23,42,0.6)",
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  chipText: { color: "#fff", fontSize: 15, fontWeight: "600", marginLeft: 6 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
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
});
