const ru = new Intl.NumberFormat("ru-RU");

export function formatNumber(value) {
  return ru.format(Math.round(Number(value) || 0));
}

export function formatTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(Number(milliseconds) || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatPercent(value) {
  return `${formatNumber(value)}%`;
}
