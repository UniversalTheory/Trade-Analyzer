import { useEffect, useRef, useState } from 'react';
import { ai } from '../../api/client';
import { setSnapshot, refresh, useAiUsage } from '../../utils/aiUsageStore';
import type { CapStatus, ModelTier } from '../../api/types';

const POLL_MS = 15 * 1000;

const FEATURE_LABELS: Record<string, string> = {
  briefing: 'Briefing commentary',
  recSummary: 'Trade-rec summary',
  portfolioSuggestions: 'Portfolio suggestions',
  chat: 'Chat',
  analyze: 'Generic analyze',
};

const MODEL_OPTIONS: ModelTier[] = ['haiku', 'sonnet', 'opus'];

function capColor(status: CapStatus): string {
  switch (status) {
    case 'blocked': return 'var(--color-red, #ef4444)';
    case 'warn90':  return '#f59e0b';
    case 'warn70':  return '#facc15';
    default:        return 'rgb(196, 156, 252)';
  }
}

function fmtUsd(v: number): string {
  if (v >= 100) return `$${v.toFixed(0)}`;
  if (v >= 10)  return `$${v.toFixed(2)}`;
  if (v >= 1)   return `$${v.toFixed(3)}`;
  return `$${v.toFixed(4)}`;
}

function timeAgo(ts: number, now: number): string {
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 60)     return 'just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function UsageWidget() {
  const snapshot = useAiUsage();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const widgetRef = useRef<HTMLDivElement>(null);

  // Initial fetch + poll
  useEffect(() => {
    void refresh();
    const id = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Tick the "X min ago" labels in the recent feed every 30s
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!snapshot) {
    return (
      <div className="usage-widget" ref={widgetRef}>
        <button className="usage-pill usage-pill-loading" disabled>
          <span className="usage-pill-label">AI</span>
          <span className="usage-pill-value">…</span>
        </button>
      </div>
    );
  }

  const color = capColor(snapshot.capStatus);
  const pct = Math.min(100, Math.round(snapshot.capPct * 100));

  return (
    <div className="usage-widget" ref={widgetRef}>
      <button
        className={`usage-pill usage-pill-${snapshot.capStatus}`}
        onClick={() => setOpen(o => !o)}
        title="AI usage this month"
        style={{ '--cap-color': color } as React.CSSProperties}
      >
        <span className="usage-pill-label">AI</span>
        <span className="usage-pill-value">
          {fmtUsd(snapshot.mtdUsd)} / {fmtUsd(snapshot.capUsd)}
        </span>
        <span className="usage-pill-bar">
          <span className="usage-pill-bar-fill" style={{ width: `${pct}%`, background: color }} />
        </span>
      </button>

      {open && <UsagePanel snapshot={snapshot} now={now} />}
    </div>
  );
}

function UsagePanel({ snapshot, now }: { snapshot: NonNullable<ReturnType<typeof useAiUsage>>; now: number }) {
  const [capInput, setCapInput] = useState(snapshot.capUsd.toString());
  const [saving, setSaving] = useState(false);
  const color = capColor(snapshot.capStatus);
  const pct = Math.min(100, Math.round(snapshot.capPct * 100));

  // Keep input in sync if snapshot.capUsd changes externally.
  useEffect(() => { setCapInput(snapshot.capUsd.toString()); }, [snapshot.capUsd]);

  async function saveCap() {
    const v = Number(capInput);
    if (!Number.isFinite(v) || v < 0) return;
    setSaving(true);
    try {
      const next = await ai.setCap(v);
      setSnapshot(next);
    } finally {
      setSaving(false);
    }
  }

  async function toggleFeature(task: string, enabled: boolean) {
    const next = await ai.setToggle(task, enabled);
    setSnapshot(next);
  }

  async function changeTaskModel(task: string, val: string) {
    const model = val === '' ? null : (val as ModelTier);
    const next = await ai.setTaskModel(task, model);
    setSnapshot(next);
  }

  async function changeGlobalOverride(val: string) {
    const model = val === '' ? null : (val as ModelTier);
    const next = await ai.setGlobalOverride(model);
    setSnapshot(next);
  }

  const featureKeys = Object.keys(snapshot.featureToggles);
  // Show one model row per task we know about — union of built-in defaults and any
  // user override, so users can still see/clear an override for a task that was
  // later removed from the built-in defaults map.
  const modelTaskKeys = Array.from(
    new Set([...Object.keys(snapshot.taskDefaults), ...Object.keys(snapshot.taskModels)])
  );
  const recent = snapshot.recentCalls.slice(0, 6);

  return (
    <div className="usage-panel" role="dialog" aria-label="AI Usage">
      <div className="usage-panel-header">
        <span className="usage-panel-title">AI Usage</span>
        <span className="usage-panel-month">{snapshot.monthKey}</span>
      </div>

      <div className="usage-panel-totals">
        <div className="usage-panel-mtd">
          <span className="usage-panel-mtd-value" style={{ color }}>{fmtUsd(snapshot.mtdUsd)}</span>
          <span className="usage-panel-mtd-of">of {fmtUsd(snapshot.capUsd)}</span>
          <span className="usage-panel-mtd-pct">({pct}%)</span>
        </div>
        <div className="usage-panel-progress">
          <div className="usage-panel-progress-fill" style={{ width: `${pct}%`, background: color }} />
        </div>
        <div className="usage-panel-session">Session: {fmtUsd(snapshot.sessionUsd)}</div>
      </div>

      <div className="usage-panel-cap">
        <label htmlFor="usage-cap-input" className="usage-panel-label">Monthly cap ($)</label>
        <div className="usage-panel-cap-row">
          <input
            id="usage-cap-input"
            type="number"
            min="0"
            step="0.01"
            value={capInput}
            onChange={e => setCapInput(e.target.value)}
            className="usage-panel-cap-input"
          />
          <button
            className="usage-panel-cap-save"
            onClick={saveCap}
            disabled={saving || capInput === snapshot.capUsd.toString()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="usage-panel-toggles">
        <div className="usage-panel-label">Features</div>
        {featureKeys.map(task => (
          <label key={task} className="usage-toggle-row">
            <span className="usage-toggle-label">{FEATURE_LABELS[task] ?? task}</span>
            <input
              type="checkbox"
              checked={snapshot.featureToggles[task]}
              onChange={e => toggleFeature(task, e.target.checked)}
            />
          </label>
        ))}
      </div>

      <div className="usage-panel-models">
        <div className="usage-panel-label">Models</div>
        <div className="usage-model-row">
          <span className="usage-model-row-label">Global override</span>
          <select
            className="usage-model-select"
            value={snapshot.globalModelOverride ?? ''}
            onChange={e => changeGlobalOverride(e.target.value)}
          >
            <option value="">off (per-task)</option>
            {MODEL_OPTIONS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        {snapshot.globalModelOverride && (
          <div className="usage-model-note">
            Global override active — per-task choices below are paused.
          </div>
        )}
        {modelTaskKeys.map(task => {
          const userChoice = snapshot.taskModels[task];
          const builtinDefault = snapshot.taskDefaults[task];
          return (
            <div key={task} className="usage-model-row">
              <span className="usage-model-row-label">{FEATURE_LABELS[task] ?? task}</span>
              <select
                className="usage-model-select"
                value={userChoice ?? ''}
                onChange={e => changeTaskModel(task, e.target.value)}
                disabled={!!snapshot.globalModelOverride}
              >
                <option value="">default{builtinDefault ? ` (${builtinDefault})` : ''}</option>
                {MODEL_OPTIONS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <div className="usage-panel-recent">
        <div className="usage-panel-label">Recent calls</div>
        {recent.length === 0 ? (
          <div className="usage-panel-empty">No calls yet this session.</div>
        ) : (
          <ul className="usage-recent-list">
            {recent.map((c, i) => (
              <li key={`${c.ts}-${i}`} className="usage-recent-row">
                <span className="usage-recent-task">{c.task}</span>
                <span className="usage-recent-model">{c.model}</span>
                <span className="usage-recent-cost">{c.cached ? 'cached' : fmtUsd(c.costUsd)}</span>
                <span className="usage-recent-time">{timeAgo(c.ts, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
