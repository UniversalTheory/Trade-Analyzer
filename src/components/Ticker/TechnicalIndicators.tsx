import { useEffect, useRef } from 'react';
import {
  createChart,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type LineSeriesOptions,
  type HistogramSeriesOptions,
} from 'lightweight-charts';
import type { PriceBar } from '../../api/types';
import { calcRSI, calcMACD } from '../../utils/technicals';

interface Props {
  bars: PriceBar[];
}

function RSIChart({ bars }: { bars: PriceBar[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#0d1117' }, textColor: '#8b949e' },
      grid: {
        vertLines: { color: '#1c2128' },
        horzLines: { color: '#1c2128' },
      },
      rightPriceScale: { borderColor: '#1c2128', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: '#1c2128', timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height: 140,
    });

    const rsiSeries = chart.addSeries(LineSeries, {
      color: '#bc8cff',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'RSI(14)',
    } as Partial<LineSeriesOptions>);

    const ob = chart.addSeries(LineSeries, {
      color: '#f8514966',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    } as Partial<LineSeriesOptions>);

    const os = chart.addSeries(LineSeries, {
      color: '#3fb95066',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    } as Partial<LineSeriesOptions>);

    const rsiData = calcRSI(bars, 14);
    rsiSeries.setData(rsiData);

    if (rsiData.length > 0) {
      const first = rsiData[0].time;
      const last = rsiData[rsiData.length - 1].time;
      ob.setData([{ time: first, value: 70 }, { time: last, value: 70 }]);
      os.setData([{ time: first, value: 30 }, { time: last, value: 30 }]);
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const observer = new ResizeObserver(entries => {
      chart.applyOptions({ width: entries[0].contentRect.width });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [bars]);

  return <div ref={containerRef} />;
}

function MACDChart({ bars }: { bars: PriceBar[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#0d1117' }, textColor: '#8b949e' },
      grid: {
        vertLines: { color: '#1c2128' },
        horzLines: { color: '#1c2128' },
      },
      rightPriceScale: { borderColor: '#1c2128' },
      timeScale: { borderColor: '#1c2128', timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height: 140,
    });

    const macdLine = chart.addSeries(LineSeries, {
      color: '#58a6ff',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'MACD',
    } as Partial<LineSeriesOptions>);

    const signalLine = chart.addSeries(LineSeries, {
      color: '#f0883e',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'Signal',
    } as Partial<LineSeriesOptions>);

    const histogram = chart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
      title: 'Hist',
    } as Partial<HistogramSeriesOptions>);

    const macdData = calcMACD(bars);
    macdLine.setData(macdData.map(d => ({ time: d.time, value: d.macd })));
    signalLine.setData(macdData.map(d => ({ time: d.time, value: d.signal })));
    histogram.setData(
      macdData.map(d => ({
        time: d.time,
        value: d.histogram,
        color: d.histogram >= 0 ? '#3fb95066' : '#f8514966',
      })),
    );

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const observer = new ResizeObserver(entries => {
      chart.applyOptions({ width: entries[0].contentRect.width });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [bars]);

  return <div ref={containerRef} />;
}

export default function TechnicalIndicators({ bars }: Props) {
  if (bars.length < 30) return null;

  return (
    <div className="technicals-card">
      <div className="technicals-panel">
        <div className="technicals-label">RSI (14)</div>
        <RSIChart bars={bars} />
      </div>
      <div className="technicals-panel">
        <div className="technicals-label">MACD (12, 26, 9)</div>
        <MACDChart bars={bars} />
      </div>
    </div>
  );
}
