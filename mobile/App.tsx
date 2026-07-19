// App shell: a two-tab bottom navigator (Pack | Browse). Pack is the capture
// hub; Browse is a stack (inventory list → box contents / item detail). The Pack
// screen hides this tab bar while its full-screen camera surfaces are up.
import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Pack from "./src/screens/Pack";
import BrowseHome from "./src/screens/BrowseHome";
import BoxDetail from "./src/screens/BoxDetail";
import ItemDetail from "./src/screens/ItemDetail";
import { colors } from "./src/theme";
import type { IconName } from "./src/ui";
import type { RootTabParamList, BrowseStackParamList } from "./src/navTypes";

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<BrowseStackParamList>();

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

function BrowseStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.fg,
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="BrowseHome" component={BrowseHome} options={{ title: "Inventory" }} />
      <Stack.Screen name="BoxDetail" component={BoxDetail} options={{ title: "Box" }} />
      <Stack.Screen name="ItemDetail" component={ItemDetail} options={{ title: "Item" }} />
    </Stack.Navigator>
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
          <Tab.Screen name="Pack" component={Pack} options={{ title: "Pack" }} />
          <Tab.Screen name="Browse" component={BrowseStack} options={{ title: "Browse" }} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
