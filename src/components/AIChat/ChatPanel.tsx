import { useEffect, useRef, useState } from 'react';
import { ai } from '../../api/client';
import { setSnapshot as setUsageSnapshot } from '../../utils/aiUsageStore';
import { loadPortfolio } from '../../utils/portfolioStorage';
import { useChatHistory, type StoredMessage } from './useChatHistory';
import type { ChatToolCallRecord, ChatRequest, ChatPortfolioSnapshot } from '../../api/types';

const TOOL_LABELS: Record<string, string> = {
  getQuoteContext: 'quote',
  searchNews: 'news',
  getPortfolioRisk: 'portfolio',
  runMonteCarlo: 'monte-carlo',
};

interface Props {
  open: boolean;
  onClose: () => void;
  activeTab: string;
  activeTicker: string | null;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'not_configured' }
  | { kind: 'cap_reached' }
  | { kind: 'feature_disabled' }
  | { kind: 'error'; message: string };

function fmtUsd(v: number): string {
  if (v >= 1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(4)}`;
}

export default function ChatPanel({ open, onClose, activeTab, activeTicker }: Props) {
  const { messages, append, clear, toWireMessages } = useChatHistory();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change or panel opens.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open, phase]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  async function send() {
    const text = draft.trim();
    if (!text || phase.kind === 'loading') return;

    setDraft('');
    setPhase({ kind: 'loading' });

    // Append user turn locally so it shows immediately
    const userMsg: StoredMessage = { role: 'user', content: text, at: Date.now() };
    append(userMsg);

    // Build portfolio snapshot from localStorage
    const port = loadPortfolio();
    const portfolio: ChatPortfolioSnapshot | undefined = port.positions.length > 0
      ? {
          positions: port.positions.map(p => ({
            symbol: p.symbol,
            shares: p.shares,
            avgPrice: p.avgPrice,
            addedAt: p.addedAt,
          })),
          cash: port.cash,
        }
      : undefined;

    // Need wire messages AFTER appending user turn — but useState batches, so
    // build them manually here from current messages + new user turn.
    const wireMessages = [
      ...toWireMessages(),
      { role: 'user' as const, content: text },
    ];

    const req: ChatRequest = {
      messages: wireMessages,
      portfolio,
      view: {
        activeTab,
        activeTicker: activeTicker ?? undefined,
        hasPortfolio: !!portfolio,
      },
    };

    try {
      const resp = await ai.chat(req);
      setUsageSnapshot(resp.usage);
      const assistantMsg: StoredMessage = {
        role: 'assistant',
        content: resp.text || '(no response)',
        toolCalls: resp.toolCalls,
        modelTier: resp.modelTier,
        costUsd: resp.costUsd,
        at: Date.now(),
      };
      append(assistantMsg);
      setPhase({ kind: 'idle' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'ai_not_configured') setPhase({ kind: 'not_configured' });
      else if (msg === 'cap_reached') setPhase({ kind: 'cap_reached' });
      else if (msg === 'feature_disabled') setPhase({ kind: 'feature_disabled' });
      else setPhase({ kind: 'error', message: msg });
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const contextChips: string[] = [];
  if (activeTicker) contextChips.push(activeTicker);
  contextChips.push(activeTab);

  return (
    <>
      {open && <div className="chat-backdrop" onClick={onClose} />}
      <aside className={`chat-panel ${open ? 'chat-panel-open' : ''}`} role="dialog" aria-label="AI analyst chat">
        <div className="chat-panel-header">
          <div className="chat-panel-title">
            <span className="chat-panel-glyph">✦</span>
            <span>Analyst</span>
          </div>
          <div className="chat-panel-header-actions">
            <button
              className="chat-panel-action"
              onClick={() => { clear(); setPhase({ kind: 'idle' }); }}
              title="Start new conversation"
              disabled={messages.length === 0}
            >
              ⟲ New
            </button>
            <button className="chat-panel-action" onClick={onClose} title="Close">×</button>
          </div>
        </div>

        <div className="chat-panel-context">
          <span className="chat-context-label">Context:</span>
          {contextChips.map((c, i) => (
            <span key={i} className="chat-context-chip">{c}</span>
          ))}
        </div>

        <div className="chat-panel-messages" ref={scrollRef}>
          {messages.length === 0 && phase.kind === 'idle' && (
            <div className="chat-empty">
              <div className="chat-empty-title">Ask anything market-related.</div>
              <div className="chat-empty-examples">
                <div>“what's driving SPY today?”</div>
                <div>“is my portfolio tech-heavy?”</div>
                <div>“POP on a 30 DTE 5% OTM covered call on NVDA”</div>
                <div>“news on TSLA”</div>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <ChatTurn key={i} message={m} />
          ))}

          {phase.kind === 'loading' && (
            <div className="chat-loading">
              <span className="chat-loading-dot" />
              <span className="chat-loading-dot" />
              <span className="chat-loading-dot" />
              <span className="chat-loading-label">thinking…</span>
            </div>
          )}

          {phase.kind === 'not_configured' && (
            <div className="chat-state-banner chat-state-warn">
              AI is not configured. Set <code>ANTHROPIC_API_KEY</code> in <code>.env</code>.
            </div>
          )}
          {phase.kind === 'cap_reached' && (
            <div className="chat-state-banner chat-state-error">
              Monthly AI cap reached. Adjust the cap in the AI widget or wait until next month.
            </div>
          )}
          {phase.kind === 'feature_disabled' && (
            <div className="chat-state-banner chat-state-warn">
              Chat is disabled. Re-enable it in the AI widget's Features section.
            </div>
          )}
          {phase.kind === 'error' && (
            <div className="chat-state-banner chat-state-error">
              {phase.message || 'Something went wrong.'}
            </div>
          )}
        </div>

        <div className="chat-panel-input">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask anything…  (Enter to send · Shift+Enter newline)"
            rows={2}
            disabled={phase.kind === 'loading' || phase.kind === 'not_configured' || phase.kind === 'feature_disabled' || phase.kind === 'cap_reached'}
          />
          <button
            className="chat-send-btn"
            onClick={send}
            disabled={!draft.trim() || phase.kind === 'loading' || phase.kind === 'not_configured' || phase.kind === 'feature_disabled' || phase.kind === 'cap_reached'}
            title="Send (Enter)"
          >
            ↑
          </button>
        </div>
      </aside>
    </>
  );
}

function ChatTurn({ message }: { message: StoredMessage }) {
  if (message.role === 'user') {
    return (
      <div className="chat-msg chat-msg-user">
        <div className="chat-msg-bubble">{message.content}</div>
      </div>
    );
  }
  return (
    <div className="chat-msg chat-msg-assistant">
      <div className="chat-msg-bubble">
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="chat-tool-row">
            {message.toolCalls.map((tc, i) => <ToolChip key={i} call={tc} />)}
          </div>
        )}
        <div className="chat-msg-text">{message.content}</div>
        {(message.modelTier || message.costUsd !== undefined) && (
          <div className="chat-msg-meta">
            <span className="chat-msg-meta-glyph">✦</span>
            {message.modelTier && <span>{message.modelTier}</span>}
            {message.costUsd !== undefined && <span>· {fmtUsd(message.costUsd)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolChip({ call }: { call: ChatToolCallRecord }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[call.name] ?? call.name;
  const args = formatArgs(call.input);
  return (
    <div className={`chat-tool-chip ${call.isError ? 'chat-tool-chip-error' : ''}`}>
      <button className="chat-tool-chip-head" onClick={() => setOpen(o => !o)}>
        <span className="chat-tool-chip-glyph">{call.isError ? '!' : '◆'}</span>
        <span className="chat-tool-chip-label">{label}</span>
        {args && <span className="chat-tool-chip-args">{args}</span>}
      </button>
      {open && (
        <div className="chat-tool-chip-preview">{call.resultPreview}…</div>
      )}
    </div>
  );
}

function formatArgs(input: Record<string, unknown>): string {
  const keys = Object.keys(input);
  if (keys.length === 0) return '';
  const parts: string[] = [];
  for (const k of keys) {
    const v = input[k];
    if (typeof v === 'string') parts.push(v);
    else if (typeof v === 'number') parts.push(String(v));
  }
  return parts.length > 0 ? parts.join(' · ') : '';
}
