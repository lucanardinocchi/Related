import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import {
  createNativeStackNavigator,
} from "@react-navigation/native-stack";
import type {
  AgentService,
  CandidatesClient,
  ChatsClient,
  GroupRelationship,
  GroupsClient,
  InteractionsClient,
  OpenThreadsClient,
  Relationship,
  RelationshipsClient,
  STTAdapter,
  TTSPlayback,
  UserContextClient,
  AmbientIntelligencePreferencesClient,
} from "@related/shared";
import type { AudioCaptureHandle } from "./voice/ExpoAudioRecorder";
import { AddContactScreen } from "./AddContactScreen";
import { CalendarScreen } from "./CalendarScreen";
import { CreateGroupScreen } from "./CreateGroupScreen";
import { relationshipChatDraft } from "./conversationalChatDraft";
import { GroupDetailScreen } from "./GroupDetailScreen";
import { GroupsListScreen } from "./GroupsListScreen";
import { HomeScreen } from "./HomeScreen";
import { MobileChatScreen } from "./MobileChatScreen";
import { RelationshipDetailScreen } from "./RelationshipDetailScreen";
import { RelationshipsListScreen } from "./RelationshipsListScreen";
import { YouScreen } from "./YouScreen";

export interface AuthedAppProps {
  relationshipsClient: RelationshipsClient;
  openThreadsClient: OpenThreadsClient;
  interactionsClient: InteractionsClient;
  groupsClient: GroupsClient;
  candidatesClient: CandidatesClient;
  userContextClient: UserContextClient;
  ambientIntelligencePreferencesClient: AmbientIntelligencePreferencesClient;
  agentService: AgentService;
  /**
   * Conversational Intelligence client (per ADR-0009 mobile amendment) —
   * powers the Chat tab. Same `chats` / `chat_messages` tables as web.
   */
  chatsClient: ChatsClient;
  /**
   * Conversational Chat voice plumbing. Threaded into MobileChatScreen
   * — undefined on Expo Web (text-only fallback) or tests.
   */
  chatStartMicCapture?: () => Promise<AudioCaptureHandle>;
  chatSttAdapter?: STTAdapter;
  chatTTSPlayback?: TTSPlayback;
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
  Chat: { initialDraft?: string } | undefined;
  Relationships: undefined;
  Groups: undefined;
  Calendar: undefined;
  You: undefined;
};

const Tab = createBottomTabNavigator<TabParams>();
const Stack = createNativeStackNavigator<RelationshipsStackParams>();
const GroupsStackNav = createNativeStackNavigator<GroupsStackParams>();

type TabNavigationProp = BottomTabNavigationProp<TabParams>;

function openConversationalChat(
  navigation: TabNavigationProp,
  relationship?: Relationship,
) {
  navigation.navigate(
    "Chat",
    relationship ? { initialDraft: relationshipChatDraft(relationship) } : undefined,
  );
}

function RelationshipsStack({
  relationshipsClient,
  openThreadsClient,
  interactionsClient,
  groupsClient,
  candidatesClient,
}: {
  relationshipsClient: RelationshipsClient;
  openThreadsClient: OpenThreadsClient;
  interactionsClient: InteractionsClient;
  groupsClient: GroupsClient;
  candidatesClient: CandidatesClient;
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
            candidatesClient={candidatesClient}
            onBack={() => navigation.goBack()}
            onSelectGroup={(group) => {
              navigation
                .getParent<TabNavigationProp>()
                ?.navigate("Groups", {
                  screen: "Detail",
                  params: { relationship: group },
                });
            }}
            onTalkToClaude={(relationship) => {
              navigation
                .getParent<TabNavigationProp>()
                ?.navigate("Chat", {
                  initialDraft: relationshipChatDraft(relationship),
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

export function AuthedApp({
  relationshipsClient,
  openThreadsClient,
  interactionsClient,
  groupsClient,
  candidatesClient,
  userContextClient,
  ambientIntelligencePreferencesClient,
  agentService: _agentService,
  chatsClient,
  chatStartMicCapture,
  chatSttAdapter,
  chatTTSPlayback,
  onSignOut,
}: AuthedAppProps) {
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerShown: false }}>
        <Tab.Screen name="Home">
          {({ navigation }) => (
            <HomeScreen
              openThreadsClient={openThreadsClient}
              interactionsClient={interactionsClient}
              relationshipsClient={relationshipsClient}
              onTalkToClaude={(relationship) =>
                openConversationalChat(navigation, relationship)
              }
              onSignOut={onSignOut}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Chat">
          {({ route }) => (
            <MobileChatScreen
              chatsClient={chatsClient}
              initialDraft={route.params?.initialDraft}
              startMicCapture={chatStartMicCapture}
              sttAdapter={chatSttAdapter}
              ttsPlayback={chatTTSPlayback}
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
              candidatesClient={candidatesClient}
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
        <Tab.Screen name="You">
          {() => (
            <YouScreen
              userContextClient={userContextClient}
              ambientIntelligencePreferencesClient={
                ambientIntelligencePreferencesClient
              }
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
