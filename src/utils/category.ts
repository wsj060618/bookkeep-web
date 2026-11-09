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

/** 中文名只用于分类管理页的候选按钮 title，不参与任何逻辑 */
const ICON_LABELS: Record<string, string> = {
  supplies: '办公用品',
  activity: '活动',
  dining: '餐饮',
  print: '打印',
  venue: '场地',
  transport: '交通',
  prize: '奖品',
  fee: '班费',
  subsidy: '补助',
  sponsor: '赞助',
  carryover: '结余',
  other: '其他',
}

const COLOR_LABELS: Record<string, string> = {
  orange: '橙色',
  purple: '紫色',
  red: '红色',
  cyan: '青色',
  green: '绿色',
  blue: '蓝色',
  yellow: '黄色',
  gray: '灰色',
}

/** 分类管理页的固定候选集：只给已有的语义 key，别让用户乱输（后端只存字符串，乱输只会得到兜底图标） */
export const ICON_CHOICES = Object.entries(ICONS).map(([key, emoji]) => ({
  key,
  emoji,
  label: ICON_LABELS[key] ?? key,
}))

export const COLOR_CHOICES = Object.entries(COLORS).map(([key, hex]) => ({
  key,
  hex,
  label: COLOR_LABELS[key] ?? key,
}))

export function iconOf(key: string | null): string {
  return (key && ICONS[key]) || ICONS.other
}

export function colorOf(key: string | null): string {
  return (key && COLORS[key]) || COLORS.gray
}