export function fmtClockTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function fmtTimeAgo(fromMs: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - fromMs);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return '1 hr ago';
  return `${hours} hr ago`;
}
