import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BrowseStackParamList } from "../navTypes";
import { Box, Item, loadInventory } from "../inventory";
import { Segmented, LoadingState, EmptyState, ErrorState } from "../ui";
import { colors, radius, space, HIT } from "../theme";
import { BoxCard, ItemCard } from "./cards";

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

  const load = useCallback(async (force: boolean) => {
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
  }, [boxes.length, items.length]);

  // Load (from cache) whenever the screen regains focus, so edits elsewhere show.
  useFocusEffect(useCallback(() => { void load(false); }, [load]));

  // Debounce the search query (~250ms).
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim().toLowerCase()), 250);
    return () => clearTimeout(id);
  }, [query]);

  const searching = debounced !== "";
  const results = useMemo(() => {
    if (!searching) return items;
    return items.filter(
      (it) =>
        it.itemCode.toLowerCase().includes(debounced) ||
        it.description.toLowerCase().includes(debounced),
    );
  }, [items, debounced, searching]);

  const refreshCtl = <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />;
  const showItems = searching || seg === "items";

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.mutedFg} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search items by code or description"
          placeholderTextColor={colors.mutedFg}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="never"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.mutedFg} />
          </TouchableOpacity>
        ) : null}
      </View>

      {!searching ? (
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
      ) : null}

      {status === "loading" ? (
        <LoadingState label="Loading inventory…" />
      ) : status === "error" ? (
        <ErrorState message={error} onRetry={() => load(true)} />
      ) : showItems ? (
        <FlatList
          key="items"
          data={searching ? results : items}
          numColumns={2}
          keyExtractor={(it) => it.itemId}
          renderItem={({ item }) => (
            <ItemCard item={item} onPress={() => navigation.navigate("ItemDetail", { item })} />
          )}
          columnWrapperStyle={styles.col}
          contentContainerStyle={styles.grid}
          refreshControl={refreshCtl}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon={searching ? "search" : "cube-outline"}
              title={searching ? `No items match "${query.trim()}"` : "No items yet"}
              subtitle={searching ? "Try a different code or word." : "Items you pack will show up here."}
            />
          }
        />
      ) : (
        <FlatList
          key="boxes"
          data={boxes}
          keyExtractor={(b) => b.boxCode}
          renderItem={({ item }) => (
            <BoxCard box={item} onPress={() => navigation.navigate("BoxDetail", { boxCode: item.boxCode, name: item.name })} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={refreshCtl}
          ListEmptyComponent={
            <EmptyState icon="cube-outline" title="No boxes yet" subtitle="Boxes you pack into will appear here." />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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
  segWrap: { marginHorizontal: space.lg, marginTop: space.md },
  list: { padding: space.lg, gap: space.md },
  grid: { padding: space.lg, gap: space.md },
  col: { gap: space.md },
});
