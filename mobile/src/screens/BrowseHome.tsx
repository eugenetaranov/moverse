import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BrowseStackParamList } from "../navTypes";
import { Box, Item, clearInventoryCache, deleteBox, deleteItem, loadInventory } from "../inventory";
import { Segmented, LoadingState, EmptyState, ErrorState } from "../ui";
import { colors, radius, space, HIT } from "../theme";
import { BoxCard, ItemRow } from "./cards";

type Props = NativeStackScreenProps<BrowseStackParamList, "BrowseHome">;
type Seg = "boxes" | "items";

export default function BrowseHome({ navigation }: Props) {
  const [seg, setSeg] = useState<Seg>("boxes");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (force: boolean) => {
      try {
        if (force) setRefreshing(true);
        else if (boxes.length === 0 && items.length === 0) setStatus("loading");
        const inv = await loadInventory(force);
        setBoxes(inv.boxes);
        setItems(inv.items);
        setStatus("ready");
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
        setStatus("error");
      } finally {
        setRefreshing(false);
      }
    },
    [boxes.length, items.length],
  );

  useFocusEffect(useCallback(() => { void load(false); }, [load]));

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim().toLowerCase()), 250);
    return () => clearTimeout(id);
  }, [query]);

  const shownBoxes = useMemo(() => {
    if (!debounced) return boxes;
    return boxes.filter(
      (b) => b.boxCode.toLowerCase().includes(debounced) || b.name.toLowerCase().includes(debounced),
    );
  }, [boxes, debounced]);

  const shownItems = useMemo(() => {
    if (!debounced) return items;
    return items.filter(
      (it) =>
        it.itemCode.toLowerCase().includes(debounced) ||
        it.description.toLowerCase().includes(debounced),
    );
  }, [items, debounced]);

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

  function confirmDeleteBox(b: Box) {
    Alert.alert(
      "Delete box?",
      `Delete ${b.boxCode}${b.itemCount ? ` (its ${b.itemCount} item${b.itemCount === 1 ? "" : "s"} keep existing)` : ""}? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBox(b.boxCode);
              setBoxes((prev) => prev.filter((x) => x.boxCode !== b.boxCode));
              clearInventoryCache();
            } catch (e) {
              Alert.alert("Delete failed", String((e as Error)?.message ?? e));
            }
          },
        },
      ],
    );
  }

  const refreshCtl = (
    <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
  );

  return (
    <View style={styles.container}>
      <View style={styles.segWrap}>
        <Segmented<Seg>
          options={[
            { value: "boxes", label: "Boxes" },
            { value: "items", label: "Items" },
          ]}
          value={seg}
          onChange={setSeg}
        />
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.mutedFg} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={seg === "boxes" ? "Search boxes" : "Search items"}
          placeholderTextColor={colors.mutedFg}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.mutedFg} />
          </TouchableOpacity>
        ) : null}
      </View>

      {status === "loading" ? (
        <LoadingState label="Loading inventory…" />
      ) : status === "error" ? (
        <ErrorState message={error} onRetry={() => load(true)} />
      ) : seg === "items" ? (
        <FlatList
          key="items"
          data={shownItems}
          keyExtractor={(it) => it.itemId}
          renderItem={({ item }) => (
            <ItemRow
              item={item}
              onPress={() => navigation.navigate("ItemDetail", { item })}
              onLongPress={() => confirmDeleteItem(item)}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={refreshCtl}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon={debounced ? "search" : "cube-outline"}
              title={debounced ? `No items match "${query.trim()}"` : "No items yet"}
              subtitle={debounced ? "Try a different code or word." : "Items you pack will show up here."}
            />
          }
        />
      ) : (
        <FlatList
          key="boxes"
          data={shownBoxes}
          keyExtractor={(b) => b.boxCode}
          renderItem={({ item }) => (
            <BoxCard
              box={item}
              onPress={() => navigation.navigate("BoxDetail", { boxCode: item.boxCode, name: item.name })}
              onLongPress={() => confirmDeleteBox(item)}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={refreshCtl}
          ListEmptyComponent={
            <EmptyState
              icon={debounced ? "search" : "cube-outline"}
              title={debounced ? `No boxes match "${query.trim()}"` : "No boxes yet"}
              subtitle={debounced ? "Try a different code or name." : "Boxes you pack into will appear here."}
            />
          }
        />
      )}
      <Text style={styles.hint}>Long-press a row to delete.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  segWrap: { marginHorizontal: space.lg, marginTop: space.md },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.md,
    paddingHorizontal: space.md,
    minHeight: HIT,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.fg, paddingVertical: space.sm },
  list: { padding: space.lg, gap: space.md },
  hint: {
    fontSize: 12,
    color: colors.mutedFg,
    textAlign: "center",
    paddingBottom: space.sm,
  },
});
