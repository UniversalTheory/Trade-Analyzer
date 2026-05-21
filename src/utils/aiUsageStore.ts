import { useEffect, useState } from 'react';
import { ai } from '../api/client';
import type { AiUsageSnapshot } from '../api/types';

// Shared usage snapshot store. UsageWidget subscribes for renders;
// AICommentary (and any future AI caller) pushes fresh snapshots from
// /analyze responses so the widget updates without waiting on a poll.

type Listener = (s: AiUsageSnapshot | null) => void;

let snapshot: AiUsageSnapshot | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l(snapshot);
}

export function getSnapshot(): AiUsageSnapshot | null {
  return snapshot;
}

export function setSnapshot(next: AiUsageSnapshot): void {
  snapshot = next;
  emit();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function refresh(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      snapshot = await ai.getUsage();
      emit();
    } catch {
      // swallow — widget will stay on last-known state
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useAiUsage(): AiUsageSnapshot | null {
  const [s, setS] = useState<AiUsageSnapshot | null>(snapshot);
  useEffect(() => subscribe(setS), []);
  return s;
}
