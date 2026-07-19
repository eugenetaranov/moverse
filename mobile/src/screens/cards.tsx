// Photo-first cards shared by the browse lists (BrowseHome + BoxDetail).
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Box, Item } from "../inventory";
import { Badge, Chip, RowCard } from "../ui";
import { colors, radius, space, type as t } from "../theme";

export function isSuitcase(type: string): boolean {
  return /suitcase/i.test(type);
}
export function isWithMe(destination: string): boolean {
  return /with me/i.test(destination);
}

// Grid tile (used in a 2-column FlatList): photo on top, code, description, and
// a chip per box the item belongs to.
export function ItemCard({ item, onPress }: { item: Item; onPress: () => void }) {
  const label =
    `${item.itemCode || "Item"}` +
    (item.description ? `, ${item.description}` : "") +
    (item.boxCodes.length ? `, in ${item.boxCodes.join(", ")}` : ", no box");
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.thumbWrap}>
        {item.photoThumbUrl ? (
          <Image source={{ uri: item.photoThumbUrl }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Ionicons name="image-outline" size={28} color={colors.mutedFg} />
          </View>
        )}
      </View>
      <Text style={styles.code} numberOfLines={1}>
        {item.itemCode || "—"}
      </Text>
      {item.description ? (
        <Text style={styles.desc} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}
      <View style={styles.chips}>
        {item.boxCodes.length ? (
          item.boxCodes.map((bc) => <Chip key={bc} icon="cube-outline" label={bc} />)
        ) : (
          <Text style={styles.noBox}>No box</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// Compact table-style row for the Items list: standard thumbnail + code +
// description + box chips. Long-press to delete.
export function ItemRow({
  item,
  onPress,
  onLongPress,
}: {
  item: Item;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${item.itemCode || "Item"}${item.description ? ", " + item.description : ""}`}
    >
      {item.photoThumbUrl ? (
        <Image source={{ uri: item.photoThumbUrl }} style={styles.rowThumb} />
      ) : (
        <View style={[styles.rowThumb, styles.thumbEmpty]}>
          <Ionicons name="image-outline" size={20} color={colors.mutedFg} />
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={styles.code} numberOfLines={1}>
          {item.itemCode || "—"}
        </Text>
        {item.description ? (
          <Text style={styles.desc} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}
        <View style={styles.chips}>
          {item.boxCodes.length ? (
            item.boxCodes.map((bc) => <Chip key={bc} icon="cube-outline" label={bc} />)
          ) : (
            <Text style={styles.noBox}>No box</Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedFg} />
    </TouchableOpacity>
  );
}

// Row card for the Boxes list (built on the shared RowCard shell).
export function BoxCard({
  box,
  onPress,
  onLongPress,
}: {
  box: Box;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <RowCard
      leadingIcon={isSuitcase(box.type) ? "briefcase-outline" : "cube-outline"}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={`Box ${box.boxCode}${box.name ? ", " + box.name : ""}, ${box.itemCount} items`}
    >
      <Text style={styles.boxCode} numberOfLines={1}>
        {box.boxCode}
      </Text>
      {box.name ? (
        <Text style={styles.boxName} numberOfLines={1}>
          {box.name}
        </Text>
      ) : null}
      <View style={styles.boxMeta}>
        {box.destination ? (
          <Badge label={box.destination} tone={isWithMe(box.destination) ? "accent" : "primary"} />
        ) : null}
        <Text style={styles.count}>
          {box.itemCount} item{box.itemCount === 1 ? "" : "s"}
        </Text>
      </View>
    </RowCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
  },
  thumbWrap: { width: "100%", aspectRatio: 1, borderRadius: radius.sm, overflow: "hidden", marginBottom: space.sm },
  thumb: { width: "100%", height: "100%", backgroundColor: colors.muted },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
  },
  rowThumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.muted },
  rowBody: { flex: 1 },
  code: { ...t.bodyStrong, color: colors.fg },
  desc: { ...t.caption, color: colors.mutedFg, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: space.sm },
  noBox: { ...t.caption, color: colors.mutedFg, fontStyle: "italic" },
  boxCode: { ...t.title, color: colors.fg },
  boxName: { ...t.caption, color: colors.mutedFg, marginTop: 1 },
  boxMeta: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xs },
  count: { ...t.caption, color: colors.mutedFg, fontWeight: "600" },
});
