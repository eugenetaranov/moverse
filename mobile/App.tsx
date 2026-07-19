// App shell: a two-tab bottom navigator (Pack | Browse). Each tab is a native
// stack so every screen shares one styled header (see `stackScreenOptions`).
// Pack's stack also hosts Settings as a pushed screen. Pack hides its header +
// this tab bar while its full-screen camera surfaces are up.
import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pack from "./src/screens/Pack";
import Settings from "./src/Settings";
import BrowseHome from "./src/screens/BrowseHome";
import BoxDetail from "./src/screens/BoxDetail";
import ItemDetail from "./src/screens/ItemDetail";
import { colors } from "./src/theme";
import { stackScreenOptions, type IconName } from "./src/ui";
import type { RootTabParamList, PackStackParamList, BrowseStackParamList } from "./src/navTypes";

const Tab = createBottomTabNavigator<RootTabParamList>();
const PackNav = createNativeStackNavigator<PackStackParamList>();
const BrowseNav = createNativeStackNavigator<BrowseStackParamList>();

// Shared header-right entry to Settings, so both top-level screens (Pack home
// and Browse home) expose the same action in the same place.
function SettingsButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel="Settings">
      <Ionicons name="settings-outline" size={22} color={colors.mutedFg} />
    </TouchableOpacity>
  );
}

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.fg,
    primary: colors.primary,
    border: colors.border,
  },
};

function PackStack() {
  return (
    <PackNav.Navigator screenOptions={stackScreenOptions}>
      <PackNav.Screen
        name="PackHome"
        component={Pack}
        options={({ navigation }) => ({
          title: "Moverse",
          headerRight: () => <SettingsButton onPress={() => navigation.navigate("Settings")} />,
        })}
      />
      <PackNav.Screen name="Settings" component={Settings} options={{ title: "Settings" }} />
    </PackNav.Navigator>
  );
}

function BrowseStack() {
  return (
    <BrowseNav.Navigator screenOptions={stackScreenOptions}>
      <BrowseNav.Screen
        name="BrowseHome"
        component={BrowseHome}
        options={({ navigation }) => ({
          title: "Inventory",
          headerRight: () => <SettingsButton onPress={() => navigation.navigate("Settings")} />,
        })}
      />
      <BrowseNav.Screen name="BoxDetail" component={BoxDetail} options={{ title: "Box" }} />
      <BrowseNav.Screen name="ItemDetail" component={ItemDetail} options={{ title: "Item" }} />
      <BrowseNav.Screen name="Settings" component={Settings} options={{ title: "Settings" }} />
    </BrowseNav.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navTheme}>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.mutedFg,
            tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
            tabBarIcon: ({ focused, color, size }) => {
              const name: IconName =
                route.name === "Pack"
                  ? focused
                    ? "add-circle"
                    : "add-circle-outline"
                  : focused
                    ? "albums"
                    : "albums-outline";
              return <Ionicons name={name} size={size} color={color} />;
            },
          })}
        >
          <Tab.Screen name="Pack" component={PackStack} options={{ title: "Pack" }} />
          <Tab.Screen name="Browse" component={BrowseStack} options={{ title: "Browse" }} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
