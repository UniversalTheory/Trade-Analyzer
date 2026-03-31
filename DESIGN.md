# Options Trade Analyzer — Design & Architecture Document

> **Created:** March 31, 2026
> **Status:** Planning complete, ready to build Phase 1 & 2

---

## 1. Project Vision

Transform the Options Trade Analyzer from a standalone client-side calculator into a **full market research and analysis platform**. The app will provide traders with a single tool to monitor markets, research sectors, analyze individual tickers, evaluate options strategies, and receive trade recommendations — all in a sleek, dark-themed UI optimized for rapid information digestion.

---

## 2. Current State

- **Stack:** React 18 + TypeScript + Vite (pure client-side)
- **Dependencies:** Only `react` and `react-dom`
- **Existing tabs:**
  1. **Spread Analysis** — Evaluates bull/bear call/put spreads and iron condors. Calculates max profit/loss, reward-to-risk, POP, breakevens, expected value, risk score (1-7).
  2. **Expected Move** — IV-based expected move calculator (1SD, 2SD, daily, straddle-implied).
  3. **Position Sizing** — Kelly Criterion calculator (full/half/quarter Kelly with contract counts).
- **UI:** Dark theme with CSS custom properties, card-based layout, `JetBrains Mono` for numbers, `IBM Plex Sans` for text. Two-column layout (380px input panel + results panel).
- **No external APIs, no backend, no state management beyond local `useState`.**

### Key Files
| File | Purpose |
|------|---------|
| `src/App.tsx` | Root component, tab navigation (`Tab = 'spread' \| 'expected' \| 'kelly'`) |
| `src/index.css` | All styles (~500 lines), CSS variables for theming |
| `src/utils/types.ts` | Shared TypeScript types |
| `src/utils/spreadCalculations.ts` | Spread analysis math |
| `src/utils/expectedMoveCalculations.ts` | Expected move math |
| `src/utils/kellyCalculations.ts` | Kelly Criterion math |
| `src/components/common/` | `ResultCard`, `ResultItem`, `InterpretationBox` — reusable UI |
| `src/components/SpreadAnalysis/` | Spread Analysis tab |
| `src/components/ExpectedMove/` | Expected Move tab |
| `src/components/KellyCriterion/` | Position Sizing tab |

---

## 3. Architecture Decisions

### Data Sources
- **Start with free APIs:** Alpha Vantage, Finnhub, `yahoo-finance2` npm package
- **Swappable architecture:** A `MarketDataProvider` interface with adapters per provider. Swapping to paid APIs (Polygon.io, Tradier, IEX Cloud) means writing a new adapter and updating the provider registry — zero changes to routes or UI.
- **Caching:** In-memory TTL cache on the server to manage rate limits (news: 5min, quotes: 1min, sector data: 15min).

### AI Analysis
- **Default:** Rules-based analysis (deterministic scoring, keyword sentiment, threshold-based interpretation)
- **Optional toggle:** Claude API integration via a global "AI: ON/OFF" toggle in the header. When enabled, each tab gets an additional "AI Insight" card with deeper analysis. Stored in `localStorage`.
- AI responses cached server-side with 15-min TTL.

### Backend
- **Lightweight Express server** running alongside Vite dev server on port 3001
- Vite proxies `/api/*` to Express (no CORS needed in dev)
- API keys stored in `.env` (never exposed to client)
- For future deployment: Express serves Vite's `dist/` folder as static files

### Charts
- **Recharts** — Custom analytics charts: P/L diagrams, sparklines, risk gauges, Greeks visualization
- **TradingView lightweight-charts** — Professional candlestick/price charts with volume overlay

### Deployment
- **Local only** for now (`npm run dev`)
- Architecture is future-proofed for Vercel/Netlify (serverless functions) or Docker deployment

---

## 4. New Tab Structure

| Tab | Name | Description |
|-----|------|-------------|
| 1 | **Home** | Live market dashboard — indices, top movers, news, macro indicators. Updates on every app open/refresh. |
| 2 | **Sectors** | Dropdown selector with 15+ sectors. Shows performance, momentum, news, risk/opportunity gauge. |
| 3 | **Ticker** | Search by symbol. Shows price chart, trend analysis, options chain, trade recommendations with risk scores. |
| 4 | **Options** | Sub-tabs: Spread Analysis, Expected Move, Position Sizing, Black-Scholes, P/L Visualizer. All existing + new tools. |

---

## 5. Build Phases

### Phase 1: Backend Infrastructure + API Abstraction Layer
**No UI changes. Pure infrastructure.**

- Express server on port 3001 with route stubs for market, sector, ticker, AI
- `MarketDataProvider` interface with adapters for Alpha Vantage, Finnhub, yahoo-finance2
- Provider registry (selects adapter per data type)
- TTL cache layer
- Client-side: fetch wrapper (`src/api/client.ts`) + `useApi<T>` hook
- Vite dev proxy config
- `.env` setup for API keys
- New deps: `express`, `cors`, `dotenv`, `yahoo-finance2`, `tsx`, `concurrently`, `@types/express`, `@types/cors`
- New dev script: `"dev": "concurrently \"vite\" \"tsx watch server/index.ts\""`

**Directory structure created:**
```
server/
  index.ts, tsconfig.json
  routes/   (market, sector, ticker, ai)
  services/ (types, providerRegistry, cache, alphaVantage, finnhub, yahooFinance)
src/api/    (client, types)
src/hooks/  (useApi)
```

### Phase 2: Enhanced Options Calculator (No API Needed)
**Parallel with Phase 1 — pure client-side math.**

- Black-Scholes pricing model (`calcOptionPrice`, `calcGreeks`)
- Greeks: delta, gamma, theta, vega, rho
- P/L data generator for all spread types
- Recharts P/L area chart (green profit / red loss, breakeven markers)
- Restructure App.tsx: 4 top-level tabs, Options tab has internal sub-tabs
- Tabs 1-3 show "Coming soon" placeholders
- New dep: `recharts`

**Files:**
```
src/utils/blackScholes.ts, plChart.ts
src/components/OptionsCalculator/ (OptionsCalculator, BlackScholes, PLChart, GreeksDisplay)
```

### Phase 3: Home Tab — Market Overview Dashboard
**Requires Phase 1.**

- Full-width dashboard layout (different from calculator two-column layout)
- Index cards: SPY, QQQ, DIA, IWM, VIX with price, day change, sparklines
- Top gainers/losers lists
- Market news feed with keyword-based sentiment
- Macro indicators: VIX interpretation, market breadth, put/call ratio
- Reusable `LoadingState` and `ErrorState` components

**Layout:**
```
Row 1: [SPY] [QQQ] [DIA] [IWM] [VIX]
Row 2: [Macro Indicators 2/3] [Breadth 1/3]
Row 3: [Top Movers 1/2] [News 1/2]
```

### Phase 4: Sector Research Tab
**Requires Phases 1 & 3.**

- Sector dropdown: Technology, Healthcare, Energy, Financials, Utilities, Consumer Disc., Consumer Staples, Industrials, Materials, Real Estate, Comm. Services, Semiconductors, Biotech, Renewable Energy, etc.
- Each sector mapped to ETF proxy (XLK, XLV, XLE, etc.)
- Performance across timeframes (1D, 1W, 1M, 3M, YTD)
- Momentum: trend direction, RSI, relative strength vs SPY
- Risk/Opportunity gauge (1-10 composite score with factor breakdown)
- Sector-specific news feed
- Static sector definitions in `server/data/sectors.ts`

### Phase 5: Ticker Search Tab
**Requires Phases 1-4. Largest phase.**

- Search bar with debounced symbol autocomplete
- TradingView candlestick chart with volume + timeframe selector (1D-1Y)
- Technical analysis: SMA, EMA, RSI, MACD, support/resistance
- Options chain table: expiration selector, calls/puts with strike, bid, ask, IV, OI, Greeks
- Trade recommendations engine: matches trend + IV regime → strategy (bull spread, bear spread, iron condor, etc.) with risk scores
- **Cross-tab integration:** "Analyze in Calculator" button pre-fills Options tab (via React context)
- New dep: `lightweight-charts`
- New context: `AppContext` for cross-tab state sharing

### Phase 6: AI Analysis Toggle (Claude API)
**Requires Phase 1. Best after all tabs built.**

- Global "AI: ON/OFF" toggle in header (localStorage)
- `POST /api/ai/analyze` endpoint proxying to Claude API
- Structured prompt templates per tab (market outlook, sector assessment, trade thesis, risk commentary)
- `AIInsight` card component (purple accent, distinct from rules-based)
- 15-min TTL caching for AI responses
- New dep: `@anthropic-ai/sdk`

### Phase 7: Polish + Production Readiness
**After all features complete.**

- TradingView mini sparklines in Home index cards
- Technical indicator overlays on ticker chart (MA, Bollinger Bands)
- Responsive CSS (mobile stacking at <900px, collapsible nav at <768px)
- Error boundaries per tab
- Settings panel: API status, AI toggle, default account size, theme toggle
- `React.lazy` + `Suspense` code splitting per tab
- Production build config (Express serves dist/)

---

## 6. Phase Dependencies

```
Phase 1 (Backend) ──→ Phase 3 (Home) ──→ Phase 4 (Sectors) ──→ Phase 5 (Ticker)
                                                                      ↓
Phase 2 (Options) ─────────────────────────────────────────→ Phase 5 (cross-tab)
                                                                      ↓
Phase 1 ──────────────────────────────────────────────────→ Phase 6 (AI)
                                                                      ↓
All ──────────────────────────────────────────────────────→ Phase 7 (Polish)
```

- **Phases 1 & 2 can run in parallel**
- Phases 3-7 are sequential

---

## 7. New Dependencies Summary

| Phase | Package | Purpose |
|-------|---------|---------|
| 1 | `express` | Backend server |
| 1 | `cors` | CORS middleware |
| 1 | `dotenv` | Environment variables |
| 1 | `yahoo-finance2` | Market data provider |
| 1 | `tsx` | Run TypeScript server |
| 1 | `concurrently` | Run Vite + Express together |
| 1 | `@types/express`, `@types/cors` | Type definitions |
| 2 | `recharts` | Custom analytics charts |
| 5 | `lightweight-charts` | TradingView candlestick charts |
| 6 | `@anthropic-ai/sdk` | Claude API for AI analysis |

---

## 8. Final Directory Structure (All Phases Complete)

```
options-trade-analyzer/
  server/
    index.ts
    tsconfig.json
    routes/        market.ts, sector.ts, ticker.ts, ai.ts
    services/      types.ts, providerRegistry.ts, cache.ts,
                   alphaVantage.ts, finnhub.ts, yahooFinance.ts, claude.ts
    data/          sectors.ts
  src/
    api/           client.ts, types.ts
    hooks/         useApi.ts, useSettings.ts
    context/       AppContext.tsx
    components/
      Home/        MarketOverview, IndexCard, TopMovers, MarketNews, MacroIndicators
      Sector/      SectorResearch, SectorSelector, SectorOverview, SectorMomentum,
                   SectorNews, RiskOpportunityGauge
      Ticker/      TickerSearch, SearchBar, TickerOverview, PriceChart, TickerNews,
                   OptionsChainView, TrendAnalysis, TradeRecommendations
      OptionsCalculator/  OptionsCalculator, BlackScholes, PLChart, GreeksDisplay
      SpreadAnalysis/     SpreadAnalysis (enhanced)
      ExpectedMove/       ExpectedMove
      KellyCriterion/     KellyCriterion
      Settings/           SettingsPanel
      common/             ResultCard, ResultItem, InterpretationBox, LoadingState,
                          ErrorState, ErrorBoundary, AIToggle, AIInsight
    utils/         types.ts, spreadCalculations.ts, expectedMoveCalculations.ts,
                   kellyCalculations.ts, blackScholes.ts, plChart.ts,
                   technicalAnalysis.ts, tradeRecommendation.ts, sectorAnalysis.ts
    App.tsx
    main.tsx
    index.css
```

---

## 9. API Keys Required

Before starting Phase 1, you'll need:
- **Alpha Vantage:** Free key at https://www.alphavantage.co/support/#api-key
- **Finnhub:** Free key at https://finnhub.io/register

Before Phase 6:
- **Anthropic:** API key at https://console.anthropic.com/

These go in a `.env` file at the project root (gitignored).

---

## 10. How to Resume

If starting a new conversation, point Claude to this document:
> "Read DESIGN.md in the project root. We're building the market research tool expansion. We're on Phase [X]. Continue from where we left off."

The plan file also exists at `.claude/plans/greedy-stirring-raven.md` with the same information in a more compact format.
