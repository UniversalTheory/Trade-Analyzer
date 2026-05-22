import fs from 'node:fs';
import path from 'node:path';
import { computeCostUsd, type ModelTier, type TokenCounts } from './pricing.js';

// Per-task feature flags (briefing, recSummary, portfolioSuggestions, chat).
// New tasks can be added without changing this shape.
export type FeatureToggles = Record<string, boolean>;

// Per-task model overrides. Absence means "use built-in default".
export type TaskModelOverrides = Record<string, ModelTier>;

interface MonthEntry {
  usd: number;
  calls: number;
}

interface CallRecord {
  ts: number;
  task: string;
  model: ModelTier;
  tokens: TokenCounts;
  costUsd: number;
  cached: boolean;
}

interface UsageState {
  version: 1;
  monthlyUsage: Record<string, MonthEntry>;
  capUsd: number;
  featureToggles: FeatureToggles;
  recentCalls: CallRecord[];
  taskModels: TaskModelOverrides;
  globalModelOverride: ModelTier | null;
}

const DEFAULT_TOGGLES: FeatureToggles = {
  briefing: true,
  recSummary: true,
  portfolioSuggestions: true,
  chat: true,
};

const RECENT_LIMIT = 50;
const STATE_FILE = process.env.AI_USAGE_FILE
  ? path.resolve(process.env.AI_USAGE_FILE)
  : path.resolve(process.cwd(), '.ai-usage.json');

function defaultCap(): number {
  const env = Number(process.env.AI_MONTHLY_CAP_USD);
  return Number.isFinite(env) && env >= 0 ? env : 20;
}

function monthKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

const VALID_TIERS: readonly ModelTier[] = ['haiku', 'sonnet', 'opus'];

function isModelTier(v: unknown): v is ModelTier {
  return typeof v === 'string' && (VALID_TIERS as readonly string[]).includes(v);
}

function sanitizeTaskModels(raw: unknown): TaskModelOverrides {
  if (!raw || typeof raw !== 'object') return {};
  const out: TaskModelOverrides = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isModelTier(v)) out[k] = v;
  }
  return out;
}

function loadState(): UsageState {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<UsageState>;
    return {
      version: 1,
      monthlyUsage: parsed.monthlyUsage ?? {},
      capUsd: typeof parsed.capUsd === 'number' ? parsed.capUsd : defaultCap(),
      featureToggles: { ...DEFAULT_TOGGLES, ...(parsed.featureToggles ?? {}) },
      recentCalls: Array.isArray(parsed.recentCalls) ? parsed.recentCalls.slice(-RECENT_LIMIT) : [],
      taskModels: sanitizeTaskModels(parsed.taskModels),
      globalModelOverride: isModelTier(parsed.globalModelOverride) ? parsed.globalModelOverride : null,
    };
  } catch {
    return {
      version: 1,
      monthlyUsage: {},
      capUsd: defaultCap(),
      featureToggles: { ...DEFAULT_TOGGLES },
      recentCalls: [],
      taskModels: {},
      globalModelOverride: null,
    };
  }
}

let state: UsageState = loadState();
let sessionUsd = 0;

function persist(): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn('[usageTracker] failed to persist state:', err);
  }
}

export type CapStatus = 'ok' | 'warn70' | 'warn90' | 'blocked';

function capStatusFor(mtdUsd: number, capUsd: number): CapStatus {
  if (capUsd <= 0) return 'ok';
  const pct = mtdUsd / capUsd;
  if (pct >= 1) return 'blocked';
  if (pct >= 0.9) return 'warn90';
  if (pct >= 0.7) return 'warn70';
  return 'ok';
}

export interface UsageSnapshot {
  mtdUsd: number;
  sessionUsd: number;
  capUsd: number;
  capPct: number;
  capStatus: CapStatus;
  featureToggles: FeatureToggles;
  recentCalls: CallRecord[];
  monthKey: string;
  taskModels: TaskModelOverrides;
  globalModelOverride: ModelTier | null;
  taskDefaults: Record<string, ModelTier>;
}

// Lazy-injected to avoid a circular import (aiRouter imports this file).
let taskDefaultsProvider: () => Record<string, ModelTier> = () => ({});

export function _setTaskDefaultsProvider(fn: () => Record<string, ModelTier>): void {
  taskDefaultsProvider = fn;
}

export function getSnapshot(): UsageSnapshot {
  const key = monthKey();
  const mtdUsd = state.monthlyUsage[key]?.usd ?? 0;
  const capUsd = state.capUsd;
  return {
    mtdUsd,
    sessionUsd,
    capUsd,
    capPct: capUsd > 0 ? mtdUsd / capUsd : 0,
    capStatus: capStatusFor(mtdUsd, capUsd),
    featureToggles: state.featureToggles,
    recentCalls: state.recentCalls.slice().reverse(),
    monthKey: key,
    taskModels: { ...state.taskModels },
    globalModelOverride: state.globalModelOverride,
    taskDefaults: taskDefaultsProvider(),
  };
}

export function getTaskModelOverride(task: string): ModelTier | undefined {
  return state.taskModels[task];
}

export function getGlobalModelOverride(): ModelTier | null {
  return state.globalModelOverride;
}

export interface PrecheckResult {
  allowed: boolean;
  reason?: 'cap_reached' | 'feature_disabled';
  snapshot: UsageSnapshot;
}

export function precheck(task: string): PrecheckResult {
  const snap = getSnapshot();
  if (state.featureToggles[task] === false) {
    return { allowed: false, reason: 'feature_disabled', snapshot: snap };
  }
  if (snap.capStatus === 'blocked') {
    return { allowed: false, reason: 'cap_reached', snapshot: snap };
  }
  return { allowed: true, snapshot: snap };
}

export function recordCall(args: {
  task: string;
  model: ModelTier;
  tokens: TokenCounts;
  cached?: boolean;
}): { costUsd: number; snapshot: UsageSnapshot } {
  const costUsd = computeCostUsd(args.model, args.tokens);
  const key = monthKey();
  const month = state.monthlyUsage[key] ?? { usd: 0, calls: 0 };
  month.usd += costUsd;
  month.calls += 1;
  state.monthlyUsage[key] = month;
  sessionUsd += costUsd;

  state.recentCalls.push({
    ts: Date.now(),
    task: args.task,
    model: args.model,
    tokens: args.tokens,
    costUsd,
    cached: !!args.cached,
  });
  if (state.recentCalls.length > RECENT_LIMIT) {
    state.recentCalls = state.recentCalls.slice(-RECENT_LIMIT);
  }
  persist();
  return { costUsd, snapshot: getSnapshot() };
}

export function setCapUsd(capUsd: number): UsageSnapshot {
  state.capUsd = Math.max(0, capUsd);
  persist();
  return getSnapshot();
}

export function setFeatureToggle(task: string, enabled: boolean): UsageSnapshot {
  state.featureToggles = { ...state.featureToggles, [task]: enabled };
  persist();
  return getSnapshot();
}

// Set or clear a per-task model override. Pass null to revert to built-in default.
export function setTaskModel(task: string, model: ModelTier | null): UsageSnapshot {
  const next = { ...state.taskModels };
  if (model == null) {
    delete next[task];
  } else {
    next[task] = model;
  }
  state.taskModels = next;
  persist();
  return getSnapshot();
}

// Set or clear the global model override. When set, it wins over per-task settings
// (but explicit req.model from a caller still wins over this).
export function setGlobalModelOverride(model: ModelTier | null): UsageSnapshot {
  state.globalModelOverride = model;
  persist();
  return getSnapshot();
}

// Test-only hook: reset state to empty (used by smoke tests if needed).
export function _resetForTests(): void {
  state = {
    version: 1,
    monthlyUsage: {},
    capUsd: defaultCap(),
    featureToggles: { ...DEFAULT_TOGGLES },
    recentCalls: [],
    taskModels: {},
    globalModelOverride: null,
  };
  sessionUsd = 0;
  persist();
}
