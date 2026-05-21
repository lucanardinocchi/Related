"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Loader2,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  SendHorizontal,
  Square,
  Trash2,
  Wrench,
} from "lucide-react";
import type {
  ChatMessage,
  ChatSummary,
  ExtractionResult,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import { Badge, Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { usePersistedBoolean } from "@/lib/usePersistedBoolean";
import { startMicCapture, type MicCaptureHandle } from "../talk/_recorder";

interface AgentViewProps {
  initialChats: ChatSummary[];
}

interface ToolCallSummary {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result_preview: string;
  error?: string;
}

interface ToastMsg {
  kind: "info" | "success" | "error";
  text: string;
}

const CHATS_RAIL_COLLAPSED_KEY = "related.agent.chats-rail.collapsed";

/**
 * Two-pane Conversational Intelligence shell, fully wired.
 *
 * - Left rail: Chat list with previews and open/closed state.
 * - Right pane: transcript + composer.
 * - Send: persists the User turn, then invokes chat-respond which runs
 *   the read-only tool-use loop and returns the assistant turn.
 * - Voice: mic toggles MediaRecorder; on stop, audio goes to voice-stt
 *   and the transcript lands in the draft (User reviews before sending).
 * - Close: stamps closed_at, then fires extract-context (Extraction
 *   Pass) once. Toast surfaces what got written. Idempotent server-side.
 */
export function AgentView({ initialChats }: AgentViewProps) {
  const { chats: chatsClient, sttAdapter } = useMemo(
    () => getBrowserDeps(),
    [],
  );

  const [chats, setChats] = useState<ChatSummary[]>(initialChats);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialChats.find((c) => !c.closedAt)?.id ??
      initialChats[0]?.id ??
      null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [working, setWorking] = useState(false);
  const [agentResponding, setAgentResponding] = useState(false);
  const [voiceState, setVoiceState] = useState<
    "idle" | "recording" | "transcribing"
  >("idle");
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const voiceHandleRef = useRef<MicCaptureHandle | null>(null);
  const [chatsRailCollapsed, toggleChatsRail] = usePersistedBoolean(
    CHATS_RAIL_COLLAPSED_KEY,
  );

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedId) ?? null,
    [chats, selectedId],
  );

  // Toast auto-dismiss.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // Load messages whenever the selected chat changes.
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);
    chatsClient
      .listMessages(selectedId)
      .then((rows) => {
        if (!cancelled) setMessages(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setToast({
            kind: "error",
            text: err instanceof Error ? err.message : String(err),
          });
          setMessages([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, chatsClient]);

  // Pin transcript to bottom on new content.
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, agentResponding]);

  const refreshChats = useCallback(async () => {
    const list = await chatsClient.listChats();
    setChats(list);
  }, [chatsClient]);

  const handleNewChat = async () => {
    setWorking(true);
    try {
      const chat = await chatsClient.createChat();
      setSelectedId(chat.id);
      setMessages([]);
      await refreshChats();
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setWorking(false);
    }
  };

  const sendUserMessage = async (text: string) => {
    if (!selectedChat || selectedChat.closedAt) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setWorking(true);
    setDraft("");
    try {
      const userMsg = await chatsClient.appendMessage({
        chatId: selectedChat.id,
        role: "user",
        content: trimmed,
      });
      setMessages((prev) => [...prev, userMsg]);

      // Auto-title the chat from the first user message (Q12).
      if (!selectedChat.title && messages.length === 0) {
        const proposed = trimmed.slice(0, 60);
        try {
          await chatsClient.renameChat(selectedChat.id, proposed);
        } catch {
          // non-fatal
        }
      }

      // Run Conversational Intelligence (chat-respond) with streaming.
      // We render a live placeholder bubble that fills in as text_delta
      // events arrive, then swap to the persisted message on `done`.
      setAgentResponding(true);
      const placeholderId = `streaming-${Date.now()}`;
      const partial: ChatMessage = {
        id: placeholderId,
        chatId: selectedChat.id,
        role: "assistant",
        content: "",
        toolCalls: [],
        toolCallId: null,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, partial]);

      try {
        for await (const event of chatsClient.respondStream(selectedChat.id)) {
          if (event.type === "text_delta") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === placeholderId
                  ? { ...m, content: m.content + event.delta }
                  : m,
              ),
            );
          } else if (event.type === "tool_use") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === placeholderId
                  ? {
                      ...m,
                      toolCalls: [
                        ...((m.toolCalls ?? []) as ToolCallSummary[]),
                        {
                          id: event.id,
                          name: event.name,
                          input: event.input,
                          result_preview: "",
                        },
                      ],
                    }
                  : m,
              ),
            );
          } else if (event.type === "tool_result") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === placeholderId
                  ? {
                      ...m,
                      toolCalls: ((m.toolCalls ?? []) as ToolCallSummary[]).map(
                        (tc) =>
                          tc.id === event.id
                            ? {
                                ...tc,
                                result_preview: event.preview,
                                error: event.error,
                              }
                            : tc,
                      ),
                    }
                  : m,
              ),
            );
          } else if (event.type === "done") {
            setMessages((prev) =>
              prev.map((m) => (m.id === placeholderId ? event.message : m)),
            );
          } else if (event.type === "error") {
            setMessages((prev) =>
              prev.filter((m) => m.id !== placeholderId),
            );
            setToast({
              kind: "error",
              text: "Agent didn't respond: " + event.message,
            });
          }
        }
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== placeholderId));
        setToast({
          kind: "error",
          text:
            "Agent didn't respond: " +
            (err instanceof Error ? err.message : String(err)),
        });
      } finally {
        setAgentResponding(false);
      }

      await refreshChats();
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
      setDraft(trimmed);
    } finally {
      setWorking(false);
    }
  };

  const handleSend = () => sendUserMessage(draft);

  const handleClose = async () => {
    if (!selectedChat || selectedChat.closedAt) return;
    setWorking(true);
    try {
      const closed = await chatsClient.closeChat(selectedChat.id);
      // Optimistic refresh first so the UI reflects closure even if
      // extraction takes a few seconds.
      await refreshChats();
      setToast({ kind: "info", text: "Chat closed. Extracting context…" });

      // Fire Extraction Pass. Long-running but non-blocking on UI;
      // we still await so we can report what got written.
      try {
        const result = await chatsClient.extract(closed.id);
        if ("skipped" in result && result.skipped) {
          setToast({
            kind: "info",
            text: `Extraction skipped: ${result.reason}.`,
          });
        } else if ("ok" in result) {
          setToast({
            kind: "success",
            text: extractionToast(result),
          });
        }
      } catch (err) {
        setToast({
          kind: "error",
          text:
            "Chat closed, but extraction failed: " +
            (err instanceof Error ? err.message : String(err)),
        });
      }

      await refreshChats();
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedChat) return;
    if (!window.confirm("Delete this chat? This cannot be undone.")) return;
    setWorking(true);
    try {
      await chatsClient.deleteChat(selectedChat.id);
      const remaining = chats.filter((c) => c.id !== selectedChat.id);
      setChats(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setMessages([]);
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setWorking(false);
    }
  };

  const handleVoiceToggle = async () => {
    if (voiceState === "idle") {
      try {
        const handle = await startMicCapture();
        voiceHandleRef.current = handle;
        setVoiceState("recording");
      } catch (err) {
        setToast({
          kind: "error",
          text: err instanceof Error ? err.message : "Microphone unavailable",
        });
      }
      return;
    }
    if (voiceState === "recording") {
      const handle = voiceHandleRef.current;
      voiceHandleRef.current = null;
      if (!handle) {
        setVoiceState("idle");
        return;
      }
      handle.stop();
      setVoiceState("transcribing");
      try {
        let final = "";
        for await (const event of sttAdapter.transcribeStream({
          audio: handle.audio,
        })) {
          if ("final" in event && typeof event.final === "string") {
            final = event.final;
          }
        }
        if (final) {
          setDraft((prev) => (prev ? `${prev} ${final}` : final));
        }
      } catch (err) {
        setToast({
          kind: "error",
          text:
            "Voice transcription failed: " +
            (err instanceof Error ? err.message : String(err)),
        });
      } finally {
        setVoiceState("idle");
      }
    }
  };

  return (
    <div className="-my-8 -mx-10 flex h-screen flex-row bg-bg">
      {/* Chat list rail — collapsible like the app nav sidebar */}
      <aside
        data-collapsed={chatsRailCollapsed ? "true" : "false"}
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-border bg-surface",
          "transition-[width] duration-150 ease-out motion-reduce:transition-none",
          chatsRailCollapsed ? "w-12" : "w-[260px]",
        )}
      >
        <div
          className={cn(
            "flex items-center pt-5 pb-3",
            chatsRailCollapsed
              ? "flex-col gap-2 px-1"
              : "justify-between px-3",
          )}
        >
          {chatsRailCollapsed ? null : (
            <span className="px-1.5 text-[13px] font-medium text-fg">
              Chats
            </span>
          )}
          <div
            className={cn(
              "flex items-center",
              chatsRailCollapsed ? "flex-col gap-1" : "gap-0.5",
            )}
          >
            <button
              type="button"
              onClick={handleNewChat}
              disabled={working}
              aria-label="New chat"
              title="New chat"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg disabled:opacity-50"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              onClick={toggleChatsRail}
              aria-label={
                chatsRailCollapsed ? "Expand chat list" : "Collapse chat list"
              }
              aria-expanded={!chatsRailCollapsed}
              title={
                chatsRailCollapsed ? "Expand chat list" : "Collapse chat list"
              }
              className="inline-flex h-7 w-7 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg"
            >
              {chatsRailCollapsed ? (
                <PanelLeftOpen size={16} />
              ) : (
                <PanelLeftClose size={16} />
              )}
            </button>
          </div>
        </div>
        {chatsRailCollapsed ? null : (
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {chats.length === 0 ? (
              <div className="px-2 py-2 text-[12px] text-fg-subtle">
                No chats yet.
              </div>
            ) : (
              <ul className="space-y-0.5">
                {chats.map((chat) => (
                  <li key={chat.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(chat.id)}
                      className={cn(
                        "w-full rounded-md px-2.5 py-2 text-left transition-colors",
                        chat.id === selectedId
                          ? "bg-active text-fg"
                          : "text-fg-muted hover:bg-hover hover:text-fg",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-medium leading-[18px]">
                          {chat.title ?? "Untitled chat"}
                        </span>
                        {chat.closedAt ? (
                          <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.06em] text-fg-subtle">
                            {chat.extractedAt ? "extracted" : "closed"}
                          </span>
                        ) : null}
                      </div>
                      {chat.lastMessagePreview ? (
                        <div className="mt-1 truncate text-[12px] leading-[16px] text-fg-subtle">
                          {chat.lastMessagePreview}
                        </div>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>

      {/* Thread + composer */}
      <section className="flex h-full min-w-0 flex-1 flex-col bg-bg">
        {selectedChat ? (
          <>
            <header className="flex items-center justify-between gap-3 border-b border-divider px-6 pt-5 pb-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <h2 className="truncate text-[15px] font-medium leading-[20px] text-fg">
                  {selectedChat.title ?? "Untitled chat"}
                </h2>
                <Badge
                  tone={
                    selectedChat.closedAt
                      ? selectedChat.extractedAt
                        ? "approved"
                        : "neutral"
                      : "info"
                  }
                >
                  {selectedChat.closedAt
                    ? selectedChat.extractedAt
                      ? "Extracted"
                      : "Closed"
                    : "Open"}
                </Badge>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {!selectedChat.closedAt ? (
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={working}
                    title="Close chat (runs Extraction Pass over the transcript)"
                    className="inline-flex h-7 items-center gap-1 rounded px-2 text-[12px] text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-50"
                  >
                    <Archive size={14} />
                    Close
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={working}
                  title="Delete chat"
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-danger disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </header>

            <div ref={transcriptRef} className="flex-1 overflow-y-auto">
              {loadingMessages ? (
                <div className="px-6 py-6 text-[13px] text-fg-subtle">
                  Loading messages…
                </div>
              ) : messages.length === 0 ? (
                <div className="mx-auto max-w-prose px-6 pt-16 text-center">
                  <div className="text-[15px] font-medium text-fg">
                    Start the conversation
                  </div>
                  <p className="mt-2 text-[13px] leading-[20px] text-fg-muted">
                    The agent reads your Relationships, Open Threads, Calendar,
                    and User Context to answer. Anything you say here will feed
                    your Situational State and Transient Intent when you close
                    this Chat — Extraction runs once per closed Chat.
                  </p>
                </div>
              ) : (
                <div className="flex min-h-full flex-col justify-end px-6 pt-6 pb-4">
                  <ul className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
                    {messages.map((m) => (
                      <li key={m.id}>
                        <MessageBubble message={m} />
                      </li>
                    ))}
                    {agentResponding ? (
                      <li>
                        <div className="flex items-center gap-2 text-[12px] text-fg-subtle">
                          <Loader2 size={14} className="animate-spin" />
                          Agent is reading your data…
                        </div>
                      </li>
                    ) : null}
                  </ul>
                </div>
              )}
            </div>

            <Composer
              draft={draft}
              setDraft={setDraft}
              onSend={handleSend}
              onMicToggle={handleVoiceToggle}
              voiceState={voiceState}
              disabled={working || !!selectedChat.closedAt}
              closed={!!selectedChat.closedAt}
            />

            {toast ? (
              <div
                className={cn(
                  "border-t px-6 py-2 text-[12px]",
                  toast.kind === "error" &&
                    "border-danger-subtle bg-danger-subtle text-danger",
                  toast.kind === "success" &&
                    "border-success-subtle bg-success-subtle text-success",
                  toast.kind === "info" &&
                    "border-accent-subtle bg-accent-subtle text-accent",
                )}
              >
                {toast.text}
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <EmptyState
              title="No chats yet"
              description="Start a Chat to ask the agent about your Relationships, Commitments, or Calendar. It reads your data — it doesn't write to it."
              action={
                <Button
                  variant="primary"
                  onClick={handleNewChat}
                  disabled={working}
                >
                  Start a Chat
                </Button>
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}

function extractionToast(result: {
  situationalStateUpdated: boolean;
  intentsCaptured: number;
  toolErrors: string[];
}): string {
  const bits: string[] = [];
  if (result.situationalStateUpdated) bits.push("Situational State updated");
  if (result.intentsCaptured > 0)
    bits.push(
      `${result.intentsCaptured} intent${
        result.intentsCaptured === 1 ? "" : "s"
      } captured`,
    );
  const head = bits.length ? bits.join(", ") : "no User Context updates";
  const tail = result.toolErrors.length
    ? ` (with ${result.toolErrors.length} tool error${
        result.toolErrors.length === 1 ? "" : "s"
      })`
    : "";
  return `Extraction complete: ${head}${tail}.`;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const toolCalls = (message.toolCalls ?? []) as ToolCallSummary[];
  const hasContent = message.content.trim().length > 0;
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div
      className={cn(
        "group flex flex-col gap-1.5",
        isUser ? "items-end" : "items-start",
      )}
    >
      {!isUser && toolCalls.length > 0 ? (
        <div className="flex w-full max-w-full flex-col gap-1">
          {toolCalls.map((tc, idx) => (
            <ToolCallBlock key={`${tc.id}-${idx}`} call={tc} />
          ))}
        </div>
      ) : null}
      {hasContent ? (
        <div
          className={cn(
            "max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-[22px] whitespace-pre-wrap break-words",
            isUser
              ? "bg-accent text-fg-on-accent shadow-1"
              : "bg-surface-2 text-fg",
          )}
        >
          {message.content}
        </div>
      ) : null}
      <div className="px-1 text-[11px] text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100">
        {time}
      </div>
    </div>
  );
}

function ToolCallBlock({ call }: { call: ToolCallSummary }) {
  const [open, setOpen] = useState(false);
  const inputJson = JSON.stringify(call.input ?? {});
  return (
    <div className="rounded-md border border-divider bg-surface text-[12px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-fg-muted hover:text-fg"
      >
        {open ? (
          <ChevronDown size={12} className="flex-none" />
        ) : (
          <ChevronRight size={12} className="flex-none" />
        )}
        <Wrench size={12} className="flex-none text-fg-subtle" />
        <span className="font-mono text-[11px]">{call.name}</span>
        {call.error ? (
          <span className="ml-auto text-[11px] text-danger">errored</span>
        ) : null}
      </button>
      {open ? (
        <div className="border-t border-divider px-2.5 py-2 text-[11px] text-fg-muted">
          {Object.keys(call.input ?? {}).length > 0 ? (
            <div className="mb-1.5">
              <div className="mb-0.5 text-[10px] uppercase tracking-wider text-fg-subtle">
                input
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-fg">
                {inputJson}
              </pre>
            </div>
          ) : null}
          {call.error ? (
            <div className="text-danger">Error: {call.error}</div>
          ) : (
            <div>
              <div className="mb-0.5 text-[10px] uppercase tracking-wider text-fg-subtle">
                result
              </div>
              <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-fg">
                {call.result_preview}
              </pre>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface ComposerProps {
  draft: string;
  setDraft: (value: string) => void;
  onSend: () => void;
  onMicToggle: () => void;
  voiceState: "idle" | "recording" | "transcribing";
  disabled: boolean;
  closed: boolean;
}

function Composer({
  draft,
  setDraft,
  onSend,
  onMicToggle,
  voiceState,
  disabled,
  closed,
}: ComposerProps) {
  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) onSend();
    }
  };
  if (closed) {
    return (
      <div className="border-t border-divider bg-surface px-6 py-3 text-center text-[12px] text-fg-subtle">
        This Chat is closed and read-only. Start a new Chat to keep talking.
      </div>
    );
  }
  return (
    <div className="bg-bg px-4 pb-5 pt-2">
      <div className="mx-auto flex max-w-[760px] items-end gap-1.5 rounded-2xl border border-border-strong bg-surface px-3 py-2 shadow-1 transition-shadow focus-within:border-accent focus-within:shadow-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          placeholder={
            voiceState === "recording"
              ? "Recording… click the square to stop."
              : voiceState === "transcribing"
                ? "Transcribing…"
                : "Message the agent…"
          }
          disabled={disabled || voiceState !== "idle"}
          className="flex-1 resize-none bg-transparent py-1 text-[14px] leading-[22px] text-fg placeholder:text-fg-subtle focus:outline-none disabled:opacity-50"
          style={{ maxHeight: "200px" }}
        />
        <button
          type="button"
          onClick={onMicToggle}
          disabled={disabled && voiceState === "idle"}
          aria-label={
            voiceState === "recording" ? "Stop recording" : "Voice input"
          }
          title={
            voiceState === "recording"
              ? "Stop recording (click)"
              : voiceState === "transcribing"
                ? "Transcribing…"
                : "Voice input"
          }
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
            voiceState === "recording"
              ? "bg-danger text-fg-on-accent hover:bg-danger/90"
              : voiceState === "transcribing"
                ? "text-fg-subtle"
                : "text-fg-subtle hover:bg-hover hover:text-fg",
          )}
        >
          {voiceState === "recording" ? (
            <Square size={14} />
          ) : voiceState === "transcribing" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Mic size={16} />
          )}
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || draft.trim().length === 0}
          aria-label="Send"
          title="Send (Enter)"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-fg-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SendHorizontal size={14} />
        </button>
      </div>
    </div>
  );
}
