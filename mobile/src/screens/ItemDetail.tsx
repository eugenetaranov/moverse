import React, { useEffect, useLayoutEffect, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BrowseStackParamList } from "../navTypes";
import { Item, clearInventoryCache, updateItem } from "../inventory";
import { PrimaryButton, SecondaryButton, FieldLabel, Badge, Chip } from "../ui";
import { colors, radius, space, type as t, HIT } from "../theme";
import { isWithMe } from "./cards";
import Scanner from "../Scanner";

type Props = NativeStackScreenProps<BrowseStackParamList, "ItemDetail">;

export default function ItemDetail({ route, navigation }: Props) {
  const [item, setItem] = useState<Item>(route.params.item);
  const [desc, setDesc] = useState(item.description);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: item.itemCode || "Item" });
  }, [navigation, item.itemCode]);

  // While the box scanner is up, own the full screen (hide header + tab bar).
  useEffect(() => {
    navigation.setOptions({ headerShown: !scanning });
    navigation.getParent()?.setOptions({ tabBarStyle: scanning ? { display: "none" } : undefined });
    return () => navigation.getParent()?.setOptions({ tabBarStyle: undefined });
  }, [navigation, scanning]);

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

  const descDirty = desc.trim() !== item.description.trim();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.photoWrap}>
        {item.photoUrl ? (
          <Image source={{ uri: item.photoUrl }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={[styles.photo, styles.photoEmpty]}>
            <Ionicons name="image-outline" size={40} color={colors.mutedFg} />
          </View>
        )}
      </View>

      <View style={styles.codeRow}>
        <Text style={styles.code}>{item.itemCode || "—"}</Text>
        {item.destination ? (
          <Badge label={item.destination} tone={isWithMe(item.destination) ? "accent" : "primary"} />
        ) : null}
      </View>

      <FieldLabel text="Description / notes" />
      <TextInput
        style={[styles.input, styles.multiline]}
        value={desc}
        onChangeText={setDesc}
        placeholder="Describe the item, or add a note…"
        placeholderTextColor={colors.mutedFg}
        multiline
      />
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
            <Chip key={bc} icon="cube-outline" label={`${bc}  ✕`} onPress={() => removeBox(bc)} />
          ))
        ) : (
          <Text style={styles.noBox}>Not in any box yet.</Text>
        )}
      </View>
      <View style={{ height: space.sm }} />
      <SecondaryButton title="Add / move to a box" icon="qr-code-outline" onPress={() => setScanning(true)} disabled={saving} />
      <Text style={styles.hint}>Tap a box chip to remove it. Scanning a box adds this item to it.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxl },
  photoWrap: { width: "100%", aspectRatio: 1, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.muted },
  photo: { width: "100%", height: "100%" },
  photoEmpty: { alignItems: "center", justifyContent: "center" },
  codeRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg },
  code: { ...t.h1, color: colors.fg },
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
  multiline: { minHeight: 88, paddingTop: space.md, paddingBottom: space.md, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  noBox: { ...t.caption, color: colors.mutedFg, fontStyle: "italic" },
  hint: { ...t.caption, color: colors.mutedFg, marginTop: space.sm },
});
