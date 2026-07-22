import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BrowseStackParamList } from "../navTypes";
import { Item, addItemPhoto, clearInventoryCache, deleteItem, updateItem } from "../inventory";
import { PrimaryButton, SecondaryButton, FieldLabel, TextField, Badge, Chip } from "../ui";
import { colors, radius, space, type as t, HIT } from "../theme";
import { isWithMe } from "./cards";
import { BoxPicker } from "./BoxPicker";
import Scanner from "../Scanner";
import Capture, { type CaptureResult } from "../Capture";
import { printers } from "../niimbot/connection";
import { MAX_COPIES } from "../boxLabelPrint";
import { NoItemPrinter, printItemLabels } from "../itemLabelPrint";
import { requestBlePerms } from "../blePerms";
import { buzzErr, buzzOk } from "../haptics";

type Props = NativeStackScreenProps<BrowseStackParamList, "ItemDetail">;

export default function ItemDetail({ route, navigation }: Props) {
  const [item, setItem] = useState<Item>(route.params.item);
  const [desc, setDesc] = useState(item.description);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<string[]>(
    item.photoUrls?.length ? item.photoUrls : item.photoUrl ? [item.photoUrl] : [],
  );
  const [printing, setPrinting] = useState(false);
  const [copies, setCopies] = useState(1);
  const [progress, setProgress] = useState("");
  const cancelRef = useRef(false);

  useEffect(() => {
    return printers.subscribe(() => setItem((i) => ({ ...i })));
  }, []);

  // Reprint the item's label — one or more copies (no new code minted).
  async function reprint() {
    if (!item.itemCode) return;
    cancelRef.current = false;
    setPrinting(true);
    setProgress("");
    try {
      const { printed } = await printItemLabels(item.itemCode, copies, {
        onProgress: (c, total) => setProgress(`Printing ${c} of ${total}…`),
        isCancelled: () => cancelRef.current,
      });
      if (printed > 0) buzzOk();
      if (printed < copies) {
        Alert.alert("Stopped", printed === 0 ? "No labels printed." : `Printed ${printed} of ${copies}.`);
      }
    } catch (e) {
      if (e instanceof NoItemPrinter) {
        noItemPrinterRecovery();
        return;
      }
      buzzErr();
      Alert.alert("Print failed", `Couldn't print label ${item.itemCode}. Try again, or write it by hand.`);
    } finally {
      setPrinting(false);
      setProgress("");
    }
  }

  function noItemPrinterRecovery() {
    Alert.alert(
      printers.connected ? "No printer for item labels" : "Printer not connected",
      printers.connected
        ? `No connected printer is set to print item labels. Assign a role in Settings, or write ${item.itemCode} by hand.`
        : `Connect a printer to print ${item.itemCode}, or write it by hand.`,
      [
        { text: "Connect & print", onPress: () => void connectAndPrint() },
        { text: "Write by hand" },
        { text: "Cancel", style: "cancel" },
      ],
    );
  }

  async function connectAndPrint() {
    setPrinting(true);
    try {
      if (!(await requestBlePerms())) {
        Alert.alert("Bluetooth needed", "Grant Bluetooth permission to connect the printer.");
        return;
      }
      await printers.connectFirstAvailable();
    } catch (e) {
      Alert.alert("Couldn't connect", String((e as Error)?.message ?? e));
      return;
    } finally {
      setPrinting(false);
    }
    await reprint();
  }

  // Append a photo to this item (items can hold more than one).
  async function onPhotoCaptured(r: CaptureResult) {
    setCapturing(false);
    if (!r.photoBase64) return;
    setUploading(true);
    try {
      await addItemPhoto(item.itemId, r.photoBase64);
      setPhotos((prev) => [...prev, r.photoUri]); // optimistic; server urls refresh on reload
      clearInventoryCache();
      buzzOk();
    } catch (e) {
      buzzErr();
      Alert.alert("Upload failed", String((e as Error)?.message ?? e));
    } finally {
      setUploading(false);
    }
  }

  useLayoutEffect(() => {
    navigation.setOptions({ title: item.itemCode || "Item" });
  }, [navigation, item.itemCode]);

  // While the scanner or camera is up, own the full screen (hide header + tab bar).
  const immersive = scanning || capturing;
  useEffect(() => {
    navigation.setOptions({ headerShown: !immersive });
    navigation.getParent()?.setOptions({ tabBarStyle: immersive ? { display: "none" } : undefined });
    return () => navigation.getParent()?.setOptions({ tabBarStyle: undefined });
  }, [navigation, immersive]);

  async function persist(next: Partial<Item>, successMsg: string) {
    setSaving(true);
    try {
      await updateItem({
        itemId: item.itemId,
        description: next.description,
        boxCodes: next.boxCodes,
      });
      clearInventoryCache(); // lists reload fresh on focus
      setItem((prev) => ({ ...prev, ...next }));
      Alert.alert("Saved", successMsg);
    } catch (e) {
      Alert.alert("Save failed", String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  function onScanBox(code: string) {
    setScanning(false);
    const trimmed = code.trim();
    if (item.boxCodes.includes(trimmed)) {
      Alert.alert("Already there", `${item.itemCode || "This item"} is already in ${trimmed}.`);
      return;
    }
    void persist({ boxCodes: [...item.boxCodes, trimmed] }, `Added to ${trimmed}.`);
  }

  function confirmDelete() {
    Alert.alert("Delete item?", `Delete ${item.itemCode || "this item"}? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteItem(item.itemId);
            clearInventoryCache();
            navigation.goBack();
          } catch (e) {
            Alert.alert("Delete failed", String((e as Error)?.message ?? e));
          }
        },
      },
    ]);
  }

  function removeBox(code: string) {
    Alert.alert("Remove from box?", `Remove ${item.itemCode || "this item"} from ${code}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => void persist({ boxCodes: item.boxCodes.filter((c) => c !== code) }, `Removed from ${code}.`),
      },
    ]);
  }

  if (scanning) {
    return (
      <Scanner
        expect="box"
        prompt="Scan the box/suitcase QR label (BOX-…)"
        onScan={onScanBox}
        onReject={(m) => {
          setScanning(false);
          Alert.alert("Wrong label", m);
        }}
        onCancel={() => setScanning(false)}
      />
    );
  }

  if (capturing) {
    return <Capture startPhase="photo" onDone={onPhotoCaptured} onCancel={() => setCapturing(false)} />;
  }

  const descDirty = desc.trim() !== item.description.trim();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
        {photos.map((uri, i) => (
          <Image key={`${uri}-${i}`} source={{ uri }} style={styles.galleryPhoto} resizeMode="cover" />
        ))}
        <TouchableOpacity
          style={[styles.galleryPhoto, styles.addPhoto]}
          onPress={() => setCapturing(true)}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel="Add photo"
        >
          {uploading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={28} color={colors.primary} />
              <Text style={styles.addPhotoText}>Add photo</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.codeRow}>
        <Text style={styles.code}>{item.itemCode || "—"}</Text>
        {item.destination ? (
          <Badge label={item.destination} tone={isWithMe(item.destination) ? "accent" : "primary"} />
        ) : null}
      </View>

      {item.itemCode ? (
        <>
          <FieldLabel text="Label" />
          <View style={styles.printRow}>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setCopies((c) => Math.max(1, c - 1))}
                disabled={printing || copies <= 1}
                hitSlop={8}
                accessibilityLabel="Fewer copies"
              >
                <Ionicons name="remove" size={20} color={copies <= 1 ? colors.mutedFg : colors.fg} />
              </TouchableOpacity>
              <Text style={styles.stepVal}>{copies}</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setCopies((c) => Math.min(MAX_COPIES, c + 1))}
                disabled={printing || copies >= MAX_COPIES}
                hitSlop={8}
                accessibilityLabel="More copies"
              >
                <Ionicons name="add" size={20} color={copies >= MAX_COPIES ? colors.mutedFg : colors.fg} />
              </TouchableOpacity>
            </View>
            {printing ? (
              <SecondaryButton title="Cancel" icon="close" tone="danger" onPress={() => (cancelRef.current = true)} style={styles.printBtn} />
            ) : (
              <PrimaryButton
                title={copies > 1 ? `Print ${copies} labels` : "Print label"}
                icon="print-outline"
                accent
                onPress={reprint}
                disabled={saving}
                style={styles.printBtn}
              />
            )}
          </View>
          {printing && progress ? <Text style={styles.printProgress}>{progress}</Text> : null}
        </>
      ) : null}

      <FieldLabel text="Description / notes" />
      <TextField multiline value={desc} onChangeText={setDesc} placeholder="Describe the item, or add a note…" />
      <View style={{ height: space.sm }} />
      <PrimaryButton
        title={saving ? "Saving…" : "Save description"}
        icon="checkmark"
        onPress={() => persist({ description: desc.trim() }, "Description updated.")}
        disabled={saving || !descDirty}
      />

      <FieldLabel text="In boxes" />
      <View style={styles.chips}>
        {item.boxCodes.length ? (
          item.boxCodes.map((bc) => (
            <Chip key={bc} icon="cube-outline" label={bc} removable onPress={() => removeBox(bc)} />
          ))
        ) : (
          <Text style={styles.noBox}>Not in any box yet.</Text>
        )}
      </View>
      <View style={{ height: space.sm }} />
      <BoxPicker onPick={(code) => onScanBox(code)} exclude={item.boxCodes} label="Add to an existing box" />
      <View style={{ height: space.sm }} />
      <SecondaryButton title="Or scan a box label" icon="qr-code-outline" onPress={() => setScanning(true)} disabled={saving} />
      <Text style={styles.hint}>Tap a box chip to remove it.</Text>

      <View style={{ height: space.xl }} />
      <SecondaryButton title="Delete item" icon="trash-outline" tone="danger" onPress={confirmDelete} disabled={saving} />
    </ScrollView>
  );
}

const PHOTO = 160;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxl },
  gallery: { gap: space.sm, paddingRight: space.lg },
  galleryPhoto: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: radius.lg,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  addPhoto: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  addPhotoText: { ...t.caption, color: colors.primary, marginTop: 4, fontWeight: "700" },
  codeRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg },
  code: { ...t.h1, color: colors.fg },
  printRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    height: 52,
  },
  stepBtn: { width: HIT, height: 52, alignItems: "center", justifyContent: "center" },
  stepVal: { ...t.bodyStrong, color: colors.fg, minWidth: 24, textAlign: "center" },
  printBtn: { flex: 1 },
  printProgress: { ...t.caption, color: colors.mutedFg, marginTop: space.sm, textAlign: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  noBox: { ...t.caption, color: colors.mutedFg, fontStyle: "italic" },
  hint: { ...t.caption, color: colors.mutedFg, marginTop: space.sm },
});
