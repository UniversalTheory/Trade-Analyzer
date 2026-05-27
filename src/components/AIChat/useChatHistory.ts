import { useEffect, useState, useCallback } from 'react';
import type { ChatMessage, ChatToolCallRecord, ModelTier } from '../../api/types';

const STORAGE_KEY = 'ai_chat_v1';

// Stored history is richer than the wire-format ChatMessage so we can render
// tool-call chips + cost meta on reload. We only send role+content over the wire.
export interface ChatTurnExtras {
  toolCalls?: ChatToolCallRecord[];
  modelTier?: ModelTier;
  costUsd?: number;
  at?: number; // timestamp
}

export type StoredMessage = ChatMessage & ChatTurnExtras;

interface StoredHistory {
  version: 1;
  messages: StoredMessage[];
}

function load(): StoredMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredHistory;
    if (parsed.version !== 1 || !Array.isArray(parsed.messages)) return [];
    return parsed.messages;
  } catch {
    return [];
  }
}

function save(messages: StoredMessage[]): void {
  try {
    const payload: StoredHistory = { version: 1, messages };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage full / unavailable — silently drop
  }
}

export function useChatHistory() {
  const [messages, setMessages] = useState<StoredMessage[]>(() => load());

  useEffect(() => {
    save(messages);
  }, [messages]);

  const append = useCallback((m: StoredMessage) => {
    setMessages(prev => [...prev, m]);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  // For the wire request, only send role + content (server doesn't need tool details
  // from prior turns — those are already baked into the assistant text).
  const toWireMessages = useCallback((): ChatMessage[] => {
    return messages.map(m => ({ role: m.role, content: m.content }));
  }, [messages]);

  return { messages, append, clear, toWireMessages };
}
