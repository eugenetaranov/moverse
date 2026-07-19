import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BrowseStackParamList } from "../navTypes";
import { Box, Item, loadInventory, updateBox } from "../inventory";
import { PrimaryButton, Segmented, FieldLabel, LoadingState, EmptyState, ErrorState } from "../ui";
import { colors, radius, space, type as t, HIT } from "../theme";
import { ItemCard, isSuitcase, isWithMe } from "./cards";

type Props = NativeStackScreenProps<BrowseStackParamList, "BoxDetail">;

const TYPES = [
  { value: "Suitcase", label: "Suitcase" },
  { value: "Shipping box", label: "Shipping box" },
];
const DESTS = [
  { value: "With me", label: "With me" },
  { value: "Shipment", label: "Shipment" },
];

export default function BoxDetail({ route, navigation }: Props) {
  const { boxCode } = route.params;
  const [box, setBox] = useState<Box | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [type, setType] = useState("Shipping box");
  const [dest, setDest] = useState("Shipment");
  const [saving, setSaving] = useState(false);

  useEffect(() => navigation.setOptions({ title: boxCode }), [navigation, boxCode]);

  const load = useCallback(async (force: boolean) => {
    try {
      setStatus((s) => (s === "ready" ? s : "loading"));
      const inv = await loadInventory(force);
      const b = inv.boxes.find((x) => x.boxCode === boxCode) ?? null;
      setBox(b);
      setItems(inv.items.filter((it) => it.boxCodes.includes(boxCode)));
      if (b) {
        setName(b.name);
        if (b.type) setType(isSuitcase(b.type) ? "Suitcase" : "Shipping box");
        if (b.destination) setDest(isWithMe(b.destination) ? "With me" : "Shipment");
      }
      setStatus("ready");
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      setStatus("error");
    }
  }, [boxCode]);

  useFocusEffect(useCallback(() => { void load(false); }, [load]));

  async function save() {
    setSaving(true);
    try {
      await updateBox({ boxCode, name, type, destination: dest });
      await load(true);
      Alert.alert("Saved", "Box details updated.");
    } catch (e) {
      Alert.alert("Save failed", String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") return <LoadingState />;
  if (status === "error") return <ErrorState message={error} onRetry={() => load(true)} />;

  const dirty =
    !!box && (name !== box.name ||
      type !== (isSuitcase(box.type) ? "Suitcase" : box.type ? "Shipping box" : type) ||
      dest !== (isWithMe(box.destination) ? "With me" : box.destination ? "Shipment" : dest));

  return (
    <FlatList
      style={styles.container}
      data={items}
      numColumns={2}
      keyExtractor={(it) => it.itemId}
      renderItem={({ item }) => (
        <ItemCard item={item} onPress={() => navigation.navigate("ItemDetail", { item })} />
      )}
      columnWrapperStyle={styles.col}
      contentContainerStyle={styles.grid}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <FieldLabel text="Name / notes" />
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Winter clothes"
            placeholderTextColor={colors.mutedFg}
          />
          <FieldLabel text="Type" />
          <Segmented options={TYPES} value={type} onChange={setType} />
          <FieldLabel text="Destination" />
          <Segmented options={DESTS} value={dest} onChange={setDest} />
          <View style={{ height: space.md }} />
          <PrimaryButton
            title={saving ? "Saving…" : "Save box details"}
            icon="checkmark"
            onPress={save}
            disabled={saving || !dirty}
          />
          <Text style={styles.count}>
            {items.length} item{items.length === 1 ? "" : "s"} in this box
          </Text>
        </View>
      }
      ListEmptyComponent={<EmptyState icon="cube-outline" title="This box is empty" subtitle="Items packed into it will appear here." />}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  grid: { padding: space.lg, gap: space.md },
  col: { gap: space.md },
  header: { marginBottom: space.sm },
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
  count: { ...t.label, color: colors.mutedFg, marginTop: space.lg },
});
