import type { ActionHandler } from "../types";

export const doNothingHandler: ActionHandler = async (_action, userEdits) => ({
  decisionState: "declined",
  mergedPayload: userEdits?.payload,
});
