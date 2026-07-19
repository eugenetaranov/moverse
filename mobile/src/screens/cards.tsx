// Photo-first cards shared by the browse lists (BrowseHome + BoxDetail).
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Box, Item } from "../inventory";
import { Badge, Chip } from "../ui";
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

// Row card for the Boxes list.
export function BoxCard({ box, onPress }: { box: Box; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.boxRow}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Box ${box.boxCode}${box.name ? ", " + box.name : ""}, ${box.itemCount} items`}
    >
      <View style={styles.boxIcon}>
        <Ionicons name={isSuitcase(box.type) ? "briefcase-outline" : "cube-outline"} size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1, marginLeft: space.md }}>
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
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.mutedFg} />
    </TouchableOpacity>
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
  code: { ...t.bodyStrong, color: colors.fg },
  desc: { ...t.caption, color: colors.mutedFg, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: space.sm },
  noBox: { ...t.caption, color: colors.mutedFg, fontStyle: "italic" },
  boxRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  boxIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  boxCode: { ...t.title, color: colors.fg },
  boxName: { ...t.caption, color: colors.mutedFg, marginTop: 1 },
  boxMeta: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xs },
  count: { ...t.caption, color: colors.mutedFg, fontWeight: "600" },
});
