import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickSeriesOptions,
  type LineSeriesOptions,
} from 'lightweight-charts';
import type { PriceBar } from '../../api/types';
import { toOHLC, calcSMA } from '../../utils/technicals';

const RANGES = ['1m', '3m', '6m', '1y', '2y'] as const;
type Range = (typeof RANGES)[number];

interface Props {
  bars: PriceBar[];
  range: Range;
  onRangeChange: (r: Range) => void;
  loading: boolean;
}

export default function PriceChart({ bars, range, onRangeChange, loading }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const sma20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const sma50Ref = useRef<ISeriesApi<'Line'> | null>(null);

  const [showSMA20, setShowSMA20] = useState(true);
  const [showSMA50, setShowSMA50] = useState(true);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0d1117' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: '#1c2128' },
        horzLines: { color: '#1c2128' },
      },
      crosshair: {
        vertLine: { color: '#58a6ff44' },
        horzLine: { color: '#58a6ff44' },
      },
      rightPriceScale: {
        borderColor: '#1c2128',
      },
      timeScale: {
        borderColor: '#1c2128',
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: 340,
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#3fb950',
      downColor: '#f85149',
      borderUpColor: '#3fb950',
      borderDownColor: '#f85149',
      wickUpColor: '#3fb950',
      wickDownColor: '#f85149',
    } as Partial<CandlestickSeriesOptions>);

    const sma20 = chart.addSeries(LineSeries, {
      color: '#58a6ff',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    } as Partial<LineSeriesOptions>);

    const sma50 = chart.addSeries(LineSeries, {
      color: '#f0883e',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    } as Partial<LineSeriesOptions>);

    chartRef.current = chart;
    candleRef.current = candles;
    sma20Ref.current = sma20;
    sma50Ref.current = sma50;

    const observer = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      chart.applyOptions({ width });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Update data
  useEffect(() => {
    if (!candleRef.current || !sma20Ref.current || !sma50Ref.current) return;
    if (bars.length === 0) return;

    const ohlc = toOHLC(bars);
    candleRef.current.setData(ohlc);

    sma20Ref.current.setData(showSMA20 ? calcSMA(bars, 20) : []);
    sma50Ref.current.setData(showSMA50 ? calcSMA(bars, 50) : []);

    chartRef.current?.timeScale().fitContent();
  }, [bars, showSMA20, showSMA50]);

  return (
    <div className="price-chart-card">
      <div className="price-chart-toolbar">
        <div className="price-chart-ranges">
          {RANGES.map(r => (
            <button
              key={r}
              className={`range-btn ${range === r ? 'active' : ''}`}
              onClick={() => onRangeChange(r)}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="price-chart-overlays">
          <button
            className={`overlay-btn ${showSMA20 ? 'active' : ''}`}
            style={{ '--overlay-color': '#58a6ff' } as React.CSSProperties}
            onClick={() => setShowSMA20(v => !v)}
          >
            SMA 20
          </button>
          <button
            className={`overlay-btn ${showSMA50 ? 'active' : ''}`}
            style={{ '--overlay-color': '#f0883e' } as React.CSSProperties}
            onClick={() => setShowSMA50(v => !v)}
          >
            SMA 50
          </button>
        </div>
      </div>

      <div className="price-chart-container" ref={containerRef}>
        {loading && (
          <div className="price-chart-loading">
            <div className="spinner" />
          </div>
        )}
      </div>
    </div>
  );
}
