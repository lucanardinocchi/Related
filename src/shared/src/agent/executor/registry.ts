import type { ActionHandler } from "./types";
import { doNothingHandler } from "./handlers/doNothing";
import { sendMessageHandler } from "./handlers/sendMessage";
import {
  logInteractionHandler,
  scheduleInteractionHandler,
} from "./handlers/createInteraction";
import { openThreadHandler } from "./handlers/openThread";
import { closeThreadHandler } from "./handlers/closeThread";
import { updateRoleOrCadenceHandler } from "./handlers/updateRoleOrCadence";

export const ACTION_HANDLERS: Record<string, ActionHandler> = {
  DoNothing: doNothingHandler,
  SendMessage: sendMessageHandler,
  ScheduleInteraction: scheduleInteractionHandler,
  LogInteraction: logInteractionHandler,
  OpenThread: openThreadHandler,
  CloseThread: closeThreadHandler,
  UpdateRoleOrCadence: updateRoleOrCadenceHandler,
};

export function getActionHandler(type: string): ActionHandler | undefined {
  return ACTION_HANDLERS[type];
}
