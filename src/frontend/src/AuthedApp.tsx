import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";
import type { Relationship, RelationshipsClient } from "@related/shared";
import { AddContactScreen } from "./AddContactScreen";
import { Home } from "./Home";
import { RelationshipDetailScreen } from "./RelationshipDetailScreen";
import { RelationshipsListScreen } from "./RelationshipsListScreen";

export interface AuthedAppProps {
  relationshipsClient: RelationshipsClient;
  onSignOut: () => void;
}

type RelationshipsStackParams = {
  List: undefined;
  Detail: { relationship: Relationship };
  AddContact: undefined;
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RelationshipsStackParams>();

function RelationshipsStack({
  relationshipsClient,
}: {
  relationshipsClient: RelationshipsClient;
}) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="List">
        {({ navigation }) => (
          <RelationshipsListScreen
            relationshipsClient={relationshipsClient}
            onSelect={(relationship) =>
              navigation.navigate("Detail", { relationship })
            }
            onAddContact={() => navigation.navigate("AddContact")}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Detail">
        {({ navigation, route }) => (
          <RelationshipDetailScreen
            relationship={route.params.relationship}
            onBack={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="AddContact"
        options={{ presentation: "modal" }}
      >
        {({ navigation }) => (
          <AddContactScreen
            relationshipsClient={relationshipsClient}
            onCreated={() => navigation.navigate("List")}
            onCancel={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

function PlaceholderTab({ name }: { name: string }) {
  return (
    <View style={styles.placeholderRoot}>
      <Text style={styles.placeholderLabel}>{name}</Text>
      <Text style={styles.placeholderHint}>Coming soon</Text>
    </View>
  );
}

export function AuthedApp({ relationshipsClient, onSignOut }: AuthedAppProps) {
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerShown: false }}>
        <Tab.Screen name="Home">
          {() => (
            <Home
              openThreads={[]}
              upcomingEvents={[]}
              threadsClosedLast30Days={new Array(30).fill(0)}
              onSignOut={onSignOut}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Relationships">
          {() => <RelationshipsStack relationshipsClient={relationshipsClient} />}
        </Tab.Screen>
        <Tab.Screen name="Calendar">
          {() => <PlaceholderTab name="Calendar" />}
        </Tab.Screen>
        <Tab.Screen name="You">{() => <PlaceholderTab name="You" />}</Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  placeholderRoot: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderLabel: {
    fontSize: 24,
    fontFamily: "InterTight_900Black",
    fontWeight: "900",
    color: "#000",
  },
  placeholderHint: {
    marginTop: 8,
    fontSize: 13,
    color: "#9ca3af",
    fontFamily: "InterTight_500Medium",
  },
});
