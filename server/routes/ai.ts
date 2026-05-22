import { Router } from 'express';
import { dispatch, isAiConfigured } from '../services/ai/aiRouter.js';
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

export default router;
