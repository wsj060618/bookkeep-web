/**
 * 分类的 icon / color 是后端存的语义 key（见 CategoryTemplate），前端负责映射成具体样式。
 * 未知 key 必须有兜底——后端加了新分类而前端没跟上时，列表不能变成空白。
 */

const ICONS: Record<string, string> = {
  supplies: '📦',
  activity: '🎉',
  dining: '🍜',
  print: '🖨️',
  venue: '🏫',
  transport: '🚌',
  prize: '🎁',
  fee: '💰',
  subsidy: '🏛️',
  sponsor: '🤝',
  carryover: '🔄',
  other: '📌',
}

const COLORS: Record<string, string> = {
  orange: '#f59e0b',
  purple: '#8b5cf6',
  red: '#ef4444',
  cyan: '#06b6d4',
  green: '#10b981',
  blue: '#3b82f6',
  yellow: '#eab308',
  gray: '#9ca3af',
}

export function iconOf(key: string | null): string {
  return (key && ICONS[key]) || ICONS.other
}

export function colorOf(key: string | null): string {
  return (key && COLORS[key]) || COLORS.gray
}