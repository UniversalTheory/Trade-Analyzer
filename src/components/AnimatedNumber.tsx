import { useEffect, useRef, useState } from 'react';
import { pulseValue } from '../utils/pulseValue';

interface Props {
  value: number;
  duration?: number;
  decimals?: number;
  /** When provided, overrides decimals and formats the animated number with locale-aware formatting */
  format?: (n: number) => string;
  prefix?: string;
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function AnimatedNumber({ value, duration = 500, decimals = 2, format, prefix = '', suffix = '', className, style }: Props) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef  = useRef<number>(0);
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const from = prevRef.current;
    const to   = value;
    if (from === to) return;

    if (spanRef.current) {
      pulseValue(spanRef.current, to > from ? 'up' : 'down');
    }

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed  = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
        prevRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  const formatted = format ? format(display) : display.toFixed(decimals);

  return (
    <span ref={spanRef} className={className} style={style}>
      {prefix}{formatted}{suffix}
    </span>
  );
}
