export function formatResourceClickCount(value) {
  const count = Number(value || 0);
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return `累计 ${safeCount.toLocaleString('zh-CN')} 次`;
}
