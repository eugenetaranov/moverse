// Multi-select for item lists (BrowseHome + BoxDetail): a selection hook, a
// bottom action bar (Move / Delete), a "move to box" sheet, and the bulk
// mutations. Moving replaces an item's box membership with the chosen box.
import React, { useCallback, useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Box, clearInventoryCache, deleteItem, loadInventory, updateItem } from "../inventory";
import { Button } from "../ui";
import { colors, radius, space, type as t, HIT } from "../theme";

// --- Selection state ------------------------------------------------------
// `mode` turns rows into checkboxes; `selected` holds the chosen item ids.
// Deselecting the last item leaves selection mode automatically.
export function useItemSelection() {
  const [mode, setMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const enter = useCallback((id: string) => {
    setMode(true);
    setSelected(new Set([id]));
  }, []);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setMode(false);
      return next;
    });
  }, []);

  const setAll = useCallback((ids: string[]) => {
    setSelected((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
  }, []);

  const clear = useCallback(() => {
    setMode(false);
    setSelected(new Set());
  }, []);

  return { mode, selected, count: selected.size, enter, toggle, setAll, clear };
}

// --- Bulk mutations -------------------------------------------------------
// Fan out per-item requests (the backend has no batch endpoint) and drop the
// session cache so lists reload fresh.
export async function moveItemsToBox(itemIds: string[], boxCode: string): Promise<void> {
  await Promise.all(itemIds.map((itemId) => updateItem({ itemId, boxCodes: [boxCode] })));
  clearInventoryCache();
}

export async function deleteItems(itemIds: string[]): Promise<void> {
  await Promise.all(itemIds.map((itemId) => deleteItem(itemId)));
  clearInventoryCache();
}

// --- Action bar -----------------------------------------------------------
export function SelectionBar({
  count,
  allSelected,
  onToggleAll,
  onMove,
  onDelete,
  onCancel,
  busy,
}: {
  count: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onMove: () => void;
  onDelete: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <View style={styles.bar}>
      <View style={styles.barTop}>
        <TouchableOpacity onPress={onCancel} hitSlop={8} style={styles.barCancel} disabled={busy}>
          <Ionicons name="close" size={20} color={colors.fg} />
          <Text style={styles.barCount}>{count} selected</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onToggleAll} hitSlop={8} disabled={busy}>
          <Text style={styles.barLink}>{allSelected ? "Clear all" : "Select all"}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.barBtns}>
        <Button
          title="Move to box"
          icon="albums-outline"
          tone="accent"
          onPress={onMove}
          disabled={busy || count === 0}
          style={styles.barBtn}
        />
        <Button
          title="Delete"
          icon="trash-outline"
          tone="danger"
          onPress={onDelete}
          disabled={busy || count === 0}
          style={styles.barBtn}
        />
      </View>
    </View>
  );
}

// --- Move-to-box sheet ----------------------------------------------------
// Slide-up list of destination boxes. `exclude` hides boxes the caller doesn't
// want as a target (e.g. the box currently being viewed).
export function MoveToBoxSheet({
  visible,
  count,
  exclude = [],
  onPick,
  onClose,
}: {
  visible: boolean;
  count: number;
  exclude?: string[];
  onPick: (boxCode: string) => void;
  onClose: () => void;
}) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  useEffect(() => {
    if (visible) loadInventory(false).then((inv) => setBoxes(inv.boxes)).catch(() => {});
  }, [visible]);
  const list = boxes.filter((b) => !exclude.includes(b.boxCode));
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.title}>
              Move {count} item{count === 1 ? "" : "s"} to…
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.headAction}>
              <Ionicons name="close" size={16} color={colors.fg} />
              <Text style={styles.headActionText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          {list.length === 0 ? (
            <Text style={styles.empty}>No other boxes to move to. Create a box first.</Text>
          ) : (
            <ScrollView>
              {list.map((b) => (
                <TouchableOpacity
                  key={b.boxCode}
                  style={styles.pickRow}
                  onPress={() => onPick(b.boxCode)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Move to ${b.boxCode}${b.name ? ", " + b.name : ""}`}
                >
                  <Ionicons name="cube-outline" size={18} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickCode}>{b.boxCode}</Text>
                    {b.name ? <Text style={styles.pickName}>{b.name}</Text> : null}
                  </View>
                  <Text style={styles.pickCount}>
                    {b.itemCount} item{b.itemCount === 1 ? "" : "s"}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  barTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  barCancel: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: HIT, paddingRight: space.md },
  barCount: { ...t.bodyStrong, color: colors.fg },
  barLink: { ...t.body, color: colors.accent, fontWeight: "700" },
  barBtns: { flexDirection: "row", gap: space.md },
  barBtn: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    maxHeight: "80%",
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.sm },
  title: { ...t.h2, color: colors.fg, flex: 1 },
  headAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  headActionText: { color: colors.fg, fontWeight: "700", fontSize: 14 },
  empty: { ...t.caption, color: colors.mutedFg, fontStyle: "italic", paddingVertical: space.md },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: HIT,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickCode: { ...t.bodyStrong, color: colors.fg },
  pickName: { ...t.caption, color: colors.mutedFg },
  pickCount: { ...t.caption, color: colors.mutedFg, fontWeight: "600" },
});
