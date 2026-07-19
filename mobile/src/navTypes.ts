// Shared navigation param types so screens get typed route params + navigation.
import type { Item } from "./inventory";

export type RootTabParamList = {
  Pack: undefined;
  Browse: undefined;
};

export type PackStackParamList = {
  PackHome: undefined;
  Settings: undefined;
};

export type BrowseStackParamList = {
  BrowseHome: undefined;
  BoxDetail: { boxCode: string; name?: string };
  ItemDetail: { item: Item };
};
