import { Router } from 'express';
import { dispatch, dispatchChat, isAiConfigured } from '../services/ai/aiRouter.js';
import type { ChatDispatchMessage } from '../services/ai/aiRouter.js';
import type {
  ChatPortfolioSnapshot,
  ChatViewContext,
} from '../services/ai/tools/types.js';
import {
  getSnapshot,
  setCapUsd,
  setFeatureToggle,
  setTaskModel,
  setGlobalModelOverride,
} from '../services/ai/usageTracker.js';
import type { ModelTier } from '../services/ai/pricing.js';

const VALID_MODELS = ['haiku', 'sonnet', 'opus'] as const;

function parseModelOrNull(v: unknown): { ok: true; value: ModelTier | null } | { ok: false } {
  if (v === null) return { ok: true, value: null };
  if (typeof v === 'string' && (VALID_MODELS as readonly string[]).includes(v)) {
    return { ok: true, value: v as ModelTier };
  }
  return { ok: false };
}

const router = Router();

router.get('/status', (_req, res) => {
  res.json({ configured: isAiConfigured() });
});

router.get('/usage', (_req, res) => {
  res.json(getSnapshot());
});

router.post('/cap', (req, res) => {
  const capUsd = Number(req.body?.capUsd);
  if (!Number.isFinite(capUsd) || capUsd < 0) {
    return res.status(400).json({ error: 'capUsd must be a non-negative number' });
  }
  res.json(setCapUsd(capUsd));
});

router.post('/toggle', (req, res) => {
  const task = req.body?.task;
  const enabled = req.body?.enabled;
  if (typeof task !== 'string' || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'task (string) and enabled (boolean) required' });
  }
  res.json(setFeatureToggle(task, enabled));
});

router.post('/task-model', (req, res) => {
  const task = req.body?.task;
  if (typeof task !== 'string' || task.length === 0) {
    return res.status(400).json({ error: 'task (non-empty string) required' });
  }
  const parsed = parseModelOrNull(req.body?.model);
  if (!parsed.ok) {
    return res.status(400).json({ error: 'model must be haiku, sonnet, opus, or null' });
  }
  res.json(setTaskModel(task, parsed.value));
});

router.post('/global-override', (req, res) => {
  const parsed = parseModelOrNull(req.body?.model);
  if (!parsed.ok) {
    return res.status(400).json({ error: 'model must be haiku, sonnet, opus, or null' });
  }
  res.json(setGlobalModelOverride(parsed.value));
});

router.post('/analyze', async (req, res) => {
  const task = req.body?.task;
  const system = req.body?.system;
  const userContent = req.body?.userContent;
  if (typeof task !== 'string' || typeof system !== 'string' || typeof userContent !== 'string') {
    return res.status(400).json({ error: 'task, system, userContent (all strings) required' });
  }
  const model = req.body?.model as ModelTier | undefined;
  if (model && !['haiku', 'sonnet', 'opus'].includes(model)) {
    return res.status(400).json({ error: 'model must be haiku, sonnet, or opus' });
  }
  if (!isAiConfigured()) {
    return res.status(503).json({ error: 'ai_not_configured' });
  }
  try {
    const result = await dispatch({
      task,
      system,
      userContent,
      cacheableContext: typeof req.body?.cacheableContext === 'string' ? req.body.cacheableContext : undefined,
      model,
      maxTokens: typeof req.body?.maxTokens === 'number' ? req.body.maxTokens : undefined,
      temperature: typeof req.body?.temperature === 'number' ? req.body.temperature : undefined,
      cacheKey: typeof req.body?.cacheKey === 'string' ? req.body.cacheKey : undefined,
      cacheTtlMs: typeof req.body?.cacheTtlMs === 'number' ? req.body.cacheTtlMs : undefined,
      bypassCache: req.body?.bypassCache === true,
    });
    res.json(result);
  } catch (err) {
    const e = err as Error & { code?: string; snapshot?: unknown };
    if (e.code === 'cap_reached') {
      return res.status(429).json({ error: 'cap_reached', snapshot: e.snapshot });
    }
    if (e.code === 'feature_disabled') {
      return res.status(403).json({ error: 'feature_disabled', snapshot: e.snapshot });
    }
    console.error('[ai/analyze]', err);
    res.status(500).json({ error: e.message ?? 'ai_error' });
  }
});

function parseMessages(raw: unknown): ChatDispatchMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ChatDispatchMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') return null;
    const obj = m as { role?: unknown; content?: unknown };
    if (obj.role !== 'user' && obj.role !== 'assistant') return null;
    if (typeof obj.content !== 'string') return null;
    out.push({ role: obj.role, content: obj.content });
  }
  if (out.length === 0) return null;
  if (out[out.length - 1].role !== 'user') return null;
  return out;
}

function parsePortfolio(raw: unknown): ChatPortfolioSnapshot | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { positions?: unknown; cash?: unknown };
  if (!Array.isArray(r.positions)) return undefined;
  const positions = r.positions
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const o = p as { symbol?: unknown; shares?: unknown; avgPrice?: unknown; addedAt?: unknown };
      if (typeof o.symbol !== 'string') return null;
      if (typeof o.shares !== 'number' || !isFinite(o.shares)) return null;
      if (typeof o.avgPrice !== 'number' || !isFinite(o.avgPrice)) return null;
      return {
        symbol: o.symbol.toUpperCase(),
        shares: o.shares,
        avgPrice: o.avgPrice,
        addedAt: typeof o.addedAt === 'string' ? o.addedAt : undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const cash = typeof r.cash === 'number' && isFinite(r.cash) ? r.cash : 0;
  return { positions, cash };
}

function parseView(raw: unknown): ChatViewContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { activeTab?: unknown; activeTicker?: unknown; hasPortfolio?: unknown };
  return {
    activeTab: typeof r.activeTab === 'string' ? r.activeTab : undefined,
    activeTicker: typeof r.activeTicker === 'string' ? r.activeTicker.toUpperCase() : undefined,
    hasPortfolio: typeof r.hasPortfolio === 'boolean' ? r.hasPortfolio : undefined,
  };
}

const CHAT_SYSTEM_PROMPT =
  'You are the AI analyst inside "Looking Glass Terminal", an options-focused market research app. ' +
  'You help an experienced options trader analyze tickers, news, portfolio risk, and strategy expectations. ' +
  'You have tools available: getQuoteContext, searchNews, getPortfolioRisk, runMonteCarlo. ' +
  'Always call tools to get concrete numbers when the user asks about specific tickers, current news, ' +
  'their portfolio, or strategy POP/EV — do not guess at prices, news, or odds. ' +
  'When a tool returns "empty: true" for portfolio data, the user has no positions yet — say so plainly. ' +
  'Keep answers conversational, concise, and specific. Reference numbers from tool results inline. ' +
  'When you cite POP or EV, mention the vol assumption (the MC tool uses 1y realized vol — flag this ' +
  'if the user might be expecting implied vol). Don\'t give boilerplate disclaimers; the user is sophisticated.';

router.post('/chat', async (req, res) => {
  if (!isAiConfigured()) {
    return res.status(503).json({ error: 'ai_not_configured' });
  }
  const messages = parseMessages(req.body?.messages);
  if (!messages) {
    return res.status(400).json({ error: 'messages must be a non-empty array ending with a user turn' });
  }
  const model = req.body?.model as ModelTier | undefined;
  if (model && !['haiku', 'sonnet', 'opus'].includes(model)) {
    return res.status(400).json({ error: 'model must be haiku, sonnet, or opus' });
  }
  const portfolio = parsePortfolio(req.body?.portfolio);
  const view = parseView(req.body?.view);

  // Build a compact system prompt incorporating view context — keeps the prompt
  // short (well below cache thresholds) so we don't fight Anthropic's cache floor.
  const contextLines: string[] = [];
  if (view?.activeTab) contextLines.push(`Current tab: ${view.activeTab}`);
  if (view?.activeTicker) contextLines.push(`Current ticker on Research tab: ${view.activeTicker}`);
  if (portfolio?.positions?.length) {
    const symbols = portfolio.positions.map(p => p.symbol).join(', ');
    contextLines.push(`User's portfolio holdings: ${symbols} (cash: $${portfolio.cash.toFixed(0)})`);
  } else if (view?.hasPortfolio === false) {
    contextLines.push('User has no portfolio positions set up yet.');
  }
  const systemPrompt = contextLines.length > 0
    ? `${CHAT_SYSTEM_PROMPT}\n\nCONTEXT:\n${contextLines.join('\n')}`
    : CHAT_SYSTEM_PROMPT;

  try {
    const result = await dispatchChat({
      messages,
      system: systemPrompt,
      toolContext: { portfolio, view },
      model,
      maxTokens: typeof req.body?.maxTokens === 'number' ? req.body.maxTokens : undefined,
    });
    res.json(result);
  } catch (err) {
    const e = err as Error & { code?: string; snapshot?: unknown };
    if (e.code === 'cap_reached') {
      return res.status(429).json({ error: 'cap_reached', snapshot: e.snapshot });
    }
    if (e.code === 'feature_disabled') {
      return res.status(403).json({ error: 'feature_disabled', snapshot: e.snapshot });
    }
    console.error('[ai/chat]', err);
    res.status(500).json({ error: e.message ?? 'chat_error' });
  }
});

export default router;
