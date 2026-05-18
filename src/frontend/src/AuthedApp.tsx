import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";
import type {
  GroupRelationship,
  GroupsClient,
  InteractionsClient,
  OpenThreadsClient,
  Relationship,
  RelationshipsClient,
} from "@related/shared";
import { AddContactScreen } from "./AddContactScreen";
import { CalendarScreen } from "./CalendarScreen";
import { CreateGroupScreen } from "./CreateGroupScreen";
import { GroupDetailScreen } from "./GroupDetailScreen";
import { GroupsListScreen } from "./GroupsListScreen";
import { HomeScreen } from "./HomeScreen";
import { RelationshipDetailScreen } from "./RelationshipDetailScreen";
import { RelationshipsListScreen } from "./RelationshipsListScreen";

export interface AuthedAppProps {
  relationshipsClient: RelationshipsClient;
  openThreadsClient: OpenThreadsClient;
  interactionsClient: InteractionsClient;
  groupsClient: GroupsClient;
  onSignOut: () => void;
}

type RelationshipsStackParams = {
  List: undefined;
  Detail: { relationship: Relationship };
  AddContact: undefined;
};

type GroupsStackParams = {
  List: undefined;
  Detail: { relationship: GroupRelationship };
  Create: undefined;
};

type TabParams = {
  Home: undefined;
  Relationships: undefined;
  Groups: undefined;
  Calendar: undefined;
  You: undefined;
};

const Tab = createBottomTabNavigator<TabParams>();
const Stack = createNativeStackNavigator<RelationshipsStackParams>();
const GroupsStackNav = createNativeStackNavigator<GroupsStackParams>();

function RelationshipsStack({
  relationshipsClient,
  openThreadsClient,
  interactionsClient,
  groupsClient,
}: {
  relationshipsClient: RelationshipsClient;
  openThreadsClient: OpenThreadsClient;
  interactionsClient: InteractionsClient;
  groupsClient: GroupsClient;
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
            relationshipsClient={relationshipsClient}
            openThreadsClient={openThreadsClient}
            interactionsClient={interactionsClient}
            groupsClient={groupsClient}
            onBack={() => navigation.goBack()}
            onSelectGroup={(group) => {
              // Cross-stack jump: switch the tab AND push the Group's detail
              // view in one motion so the back chevron returns into the
              // Groups tab rather than back to the Contact's view.
              navigation
                .getParent<TabNavigationProp>()
                ?.navigate("Groups", {
                  screen: "Detail",
                  params: { relationship: group },
                });
            }}
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

type TabNavigationProp = ReturnType<
  typeof useNavigation<NativeStackNavigationProp<TabParams>>
>;

function GroupsStack({
  groupsClient,
  relationshipsClient,
  openThreadsClient,
  interactionsClient,
}: {
  groupsClient: GroupsClient;
  relationshipsClient: RelationshipsClient;
  openThreadsClient: OpenThreadsClient;
  interactionsClient: InteractionsClient;
}) {
  return (
    <GroupsStackNav.Navigator screenOptions={{ headerShown: false }}>
      <GroupsStackNav.Screen name="List">
        {({ navigation }) => (
          <GroupsListScreen
            groupsClient={groupsClient}
            onSelect={(relationship) =>
              navigation.navigate("Detail", { relationship })
            }
            onCreateGroup={() => navigation.navigate("Create")}
          />
        )}
      </GroupsStackNav.Screen>
      <GroupsStackNav.Screen name="Detail">
        {({ navigation, route }) => (
          <GroupDetailScreen
            relationship={route.params.relationship}
            groupsClient={groupsClient}
            openThreadsClient={openThreadsClient}
            interactionsClient={interactionsClient}
            onBack={() => navigation.goBack()}
          />
        )}
      </GroupsStackNav.Screen>
      <GroupsStackNav.Screen
        name="Create"
        options={{ presentation: "modal" }}
      >
        {({ navigation }) => (
          <CreateGroupScreen
            groupsClient={groupsClient}
            relationshipsClient={relationshipsClient}
            onCreated={() => navigation.navigate("List")}
            onCancel={() => navigation.goBack()}
          />
        )}
      </GroupsStackNav.Screen>
    </GroupsStackNav.Navigator>
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

export function AuthedApp({
  relationshipsClient,
  openThreadsClient,
  interactionsClient,
  groupsClient,
  onSignOut,
}: AuthedAppProps) {
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerShown: false }}>
        <Tab.Screen name="Home">
          {() => (
            <HomeScreen
              openThreadsClient={openThreadsClient}
              interactionsClient={interactionsClient}
              onSignOut={onSignOut}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Relationships">
          {() => (
            <RelationshipsStack
              relationshipsClient={relationshipsClient}
              openThreadsClient={openThreadsClient}
              interactionsClient={interactionsClient}
              groupsClient={groupsClient}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Groups">
          {() => (
            <GroupsStack
              groupsClient={groupsClient}
              relationshipsClient={relationshipsClient}
              openThreadsClient={openThreadsClient}
              interactionsClient={interactionsClient}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Calendar">
          {() => (
            <CalendarScreen interactionsClient={interactionsClient} />
          )}
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
