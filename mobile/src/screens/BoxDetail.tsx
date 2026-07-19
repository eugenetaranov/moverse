import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BrowseStackParamList } from "../navTypes";
import { Box, Item, clearInventoryCache, deleteBox, deleteItem, loadInventory, updateBox } from "../inventory";
import { PrimaryButton, SecondaryButton, Segmented, FieldLabel, TextField, LoadingState, EmptyState, ErrorState } from "../ui";
import { colors, space, type as t } from "../theme";
import { ItemRow, isSuitcase, isWithMe } from "./cards";

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

  function confirmDeleteBox() {
    Alert.alert(
      "Delete box?",
      `Delete ${boxCode}${items.length ? ` (its ${items.length} item${items.length === 1 ? "" : "s"} keep existing)` : ""}? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBox(boxCode);
              clearInventoryCache();
              navigation.goBack();
            } catch (e) {
              Alert.alert("Delete failed", String((e as Error)?.message ?? e));
            }
          },
        },
      ],
    );
  }

  function confirmDeleteItem(it: Item) {
    Alert.alert("Delete item?", `Delete ${it.itemCode || "this item"}? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteItem(it.itemId);
            setItems((prev) => prev.filter((x) => x.itemId !== it.itemId));
            clearInventoryCache();
          } catch (e) {
            Alert.alert("Delete failed", String((e as Error)?.message ?? e));
          }
        },
      },
    ]);
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
      keyExtractor={(it) => it.itemId}
      renderItem={({ item }) => (
        <ItemRow
          item={item}
          onPress={() => navigation.navigate("ItemDetail", { item })}
          onLongPress={() => confirmDeleteItem(item)}
        />
      )}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <FieldLabel text="Name / notes" />
          <TextField value={name} onChangeText={setName} placeholder="e.g. Winter clothes" />
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
          <View style={{ height: space.sm }} />
          <SecondaryButton title="Delete box" icon="trash-outline" onPress={confirmDeleteBox} disabled={saving} />
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
  list: { padding: space.lg, gap: space.md },
  header: { marginBottom: space.sm },
  count: { ...t.label, color: colors.mutedFg, marginTop: space.lg },
});
