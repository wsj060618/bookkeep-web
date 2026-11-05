import type { InjectionKey, Ref } from 'vue'
import { inject } from 'vue'
import type { Category, Transaction } from '../types/api'

/**
 * AppLayout 提供给子页面的能力：分类、数据版本号、记一笔弹窗。
 * 弹窗挂在 layout 上，所以三个页面共用同一个表单；页面改完数据只要把 txVersion +1，
 * 当前页 watch 到变化就重新拉数据（不需要页面之间互相 import）。
 */
export interface ShellApi {
  /** 当前账本的分类；切账本时由 layout 重拉 */
  categories: Ref<Category[]>
  /** 流水数据版本号，任何页面改过流水后 +1 */
  txVersion: Ref<number>
  openCreate: () => void
  openEdit: (tx: Transaction) => void
  notifyTxChanged: () => void
}

export const SHELL_KEY: InjectionKey<ShellApi> = Symbol('bookkeep-shell')

export function useShell(): ShellApi {
  const shell = inject(SHELL_KEY)
  if (!shell) {
    throw new Error('useShell() 只能在 AppLayout 的子页面里使用')
  }
  return shell
}