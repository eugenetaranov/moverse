import React, { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CameraView } from "expo-camera";
import { classify, LabelKind } from "./labels";

interface Props {
  expect: "item" | "box";
  prompt: string;
  onScan: (code: string) => void;
  onReject: (message: string) => void;
}

/**
 * Live QR scanner. Validates the scanned code against the expected label kind
 * and only calls onScan for a matching code; wrong/unknown codes call onReject.
 * A ref lock prevents the same frame from firing onScan repeatedly.
 */
export default function Scanner({ expect, prompt, onScan, onReject }: Props) {
  const locked = useRef(false);

  function handleBarcode(code: string) {
    if (locked.current) return;
    locked.current = true;
    // release the lock shortly after so the next step / retry can scan again
    setTimeout(() => (locked.current = false), 1200);

    const kind: LabelKind = classify(code);
    if (kind === expect) {
      onScan(code.trim());
    } else if (kind === "unknown") {
      onReject("Unrecognized label — expected an " + expect + " code.");
    } else {
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
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.reticle} />
        <Text style={styles.prompt}>{prompt}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
