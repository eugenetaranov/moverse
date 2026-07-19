import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Box, loadInventory } from "../inventory";
import { colors, radius, space, type as t, HIT } from "../theme";

// Collapsible dropdown of existing boxes. Tap one to pick it. `exclude` hides
// boxes already assigned; `label` customizes the collapsed prompt.
export function BoxPicker({
  onPick,
  exclude = [],
  label = "Pick an existing box",
}: {
  onPick: (boxCode: string) => void;
  exclude?: string[];
  label?: string;
}) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    loadInventory(false)
      .then((inv) => setBoxes(inv.boxes))
      .catch(() => {});
  }, []);
  const list = boxes.filter((b) => !exclude.includes(b.boxCode));
  return (
    <View>
      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen((o) => !o)} activeOpacity={0.8}>
        <Ionicons name="albums-outline" size={18} color={colors.mutedFg} />
        <Text style={styles.dropdownLabel}>
          {list.length ? `${label} (${list.length})` : "No other boxes yet"}
        </Text>
        {list.length ? (
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedFg} />
        ) : null}
      </TouchableOpacity>
      {open && list.length ? (
        <View style={styles.list}>
          {list.map((b) => (
            <TouchableOpacity
              key={b.boxCode}
              style={styles.item}
              onPress={() => {
                setOpen(false);
                onPick(b.boxCode);
              }}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.code}>{b.boxCode}</Text>
                {b.name ? <Text style={styles.name}>{b.name}</Text> : null}
              </View>
              <Text style={styles.count}>
                {b.itemCount} item{b.itemCount === 1 ? "" : "s"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: HIT,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dropdownLabel: { ...t.bodyStrong, color: colors.fg, flex: 1 },
  list: {
    marginTop: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: HIT,
    paddingHorizontal: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  code: { ...t.bodyStrong, color: colors.fg },
  name: { ...t.caption, color: colors.mutedFg },
  count: { ...t.caption, color: colors.mutedFg, fontWeight: "600" },
});
