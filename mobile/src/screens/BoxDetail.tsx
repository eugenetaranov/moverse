import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BrowseStackParamList } from "../navTypes";
import { Box, Item, clearInventoryCache, deleteBox, deleteItem, loadInventory, updateBox } from "../inventory";
import { PrimaryButton, SecondaryButton, Segmented, FieldLabel, TextField, LoadingState, EmptyState, ErrorState } from "../ui";
import { colors, radius, space, type as t, HIT } from "../theme";
import { ItemRow, SwipeToDelete, isSuitcase, isWithMe } from "./cards";
import { MoveToBoxSheet, SelectionBar, deleteItems, moveItemsToBox, useItemSelection } from "./selection";
import { MAX_COPIES, NoBoxPrinter, printBoxLabels } from "../boxLabelPrint";
import { printers } from "../niimbot/connection";
import { requestBlePerms } from "../blePerms";
import { buzzErr, buzzOk } from "../haptics";

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
  const [copies, setCopies] = useState(1);
  const [printing, setPrinting] = useState(false);
  const [progress, setProgress] = useState("");
  const cancelRef = useRef(false);
  const sel = useItemSelection();
  const [moveOpen, setMoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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

  // Print one or more copies of this box's label, routed to the box printer.
  async function printLabel() {
    cancelRef.current = false;
    setPrinting(true);
    setProgress("");
    try {
      const { printed } = await printBoxLabels(boxCode, copies, {
        onProgress: (c, total) => setProgress(`Printing ${c} of ${total}…`),
        isCancelled: () => cancelRef.current,
      });
      if (printed > 0) buzzOk();
      if (printed < copies) {
        Alert.alert("Stopped", printed === 0 ? "No labels printed." : `Printed ${printed} of ${copies}.`);
      }
    } catch (e) {
      if (e instanceof NoBoxPrinter) {
        noBoxPrinterRecovery();
        return;
      }
      buzzErr();
      Alert.alert("Print failed", `Couldn't print the label for ${boxCode}. Try again, or write it by hand.`);
    } finally {
      setPrinting(false);
      setProgress("");
    }
  }

  function noBoxPrinterRecovery() {
    Alert.alert(
      printers.connected ? "No printer for box labels" : "Printer not connected",
      printers.connected
        ? `No connected printer is set to print box labels. Assign a box role in Settings, or write ${boxCode} on the box by hand.`
        : `Connect a printer to print ${boxCode}, or write it on the box by hand.`,
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
    await printLabel();
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

  // Moving replaces box membership, so moved items leave this box's list.
  async function moveSelectedTo(toBox: string) {
    const ids = [...sel.selected];
    const idSet = new Set(ids);
    setMoveOpen(false);
    setBusy(true);
    try {
      await moveItemsToBox(ids, toBox);
      setItems((prev) => prev.filter((x) => !idSet.has(x.itemId)));
      sel.clear();
    } catch (e) {
      Alert.alert("Move failed", String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function confirmDeleteSelected() {
    const ids = [...sel.selected];
    const idSet = new Set(ids);
    Alert.alert(
      "Delete items?",
      `Delete ${ids.length} item${ids.length === 1 ? "" : "s"}? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await deleteItems(ids);
              setItems((prev) => prev.filter((x) => !idSet.has(x.itemId)));
              sel.clear();
            } catch (e) {
              Alert.alert("Delete failed", String((e as Error)?.message ?? e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  if (status === "loading") return <LoadingState />;
  if (status === "error") return <ErrorState message={error} onRetry={() => load(true)} />;

  const dirty =
    !!box && (name !== box.name ||
      type !== (isSuitcase(box.type) ? "Suitcase" : box.type ? "Shipping box" : type) ||
      dest !== (isWithMe(box.destination) ? "With me" : box.destination ? "Shipment" : dest));

  return (
    <View style={styles.container}>
    <FlatList
      style={styles.container}
      data={items}
      keyExtractor={(it) => it.itemId}
      renderItem={({ item }) =>
        sel.mode ? (
          <ItemRow
            item={item}
            selectionMode
            selected={sel.selected.has(item.itemId)}
            onPress={() => sel.toggle(item.itemId)}
            onLongPress={() => sel.toggle(item.itemId)}
          />
        ) : (
          <SwipeToDelete onDelete={() => confirmDeleteItem(item)}>
            <ItemRow
              item={item}
              onPress={() => navigation.navigate("ItemDetail", { item })}
              onLongPress={() => sel.enter(item.itemId)}
            />
          </SwipeToDelete>
        )
      }
      extraData={sel.selected}
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

          <FieldLabel text="Box label" />
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
              <Text style={styles.stepVal} accessibilityLabel={`${copies} copies`}>
                {copies}
              </Text>
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
                onPress={printLabel}
                style={styles.printBtn}
              />
            )}
          </View>
          {printing && progress ? <Text style={styles.printProgress}>{progress}</Text> : null}

          <View style={{ height: space.sm }} />
          <SecondaryButton title="Delete box" icon="trash-outline" tone="danger" onPress={confirmDeleteBox} disabled={saving || printing} />
          <Text style={styles.count}>
            {items.length} item{items.length === 1 ? "" : "s"} in this box
          </Text>
        </View>
      }
      ListEmptyComponent={<EmptyState icon="cube-outline" title="This box is empty" subtitle="Items packed into it will appear here." />}
    />
    {sel.mode ? (
      <SelectionBar
        count={sel.count}
        allSelected={sel.count === items.length && items.length > 0}
        onToggleAll={() => sel.setAll(items.map((it) => it.itemId))}
        onMove={() => setMoveOpen(true)}
        onDelete={confirmDeleteSelected}
        onCancel={sel.clear}
        busy={busy}
      />
    ) : null}
    <MoveToBoxSheet
      visible={moveOpen}
      count={sel.count}
      exclude={[boxCode]}
      onPick={moveSelectedTo}
      onClose={() => setMoveOpen(false)}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space.lg, gap: space.md },
  header: { marginBottom: space.sm },
  count: { ...t.label, color: colors.mutedFg, marginTop: space.lg },
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
});
