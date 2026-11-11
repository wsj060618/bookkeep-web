<script setup lang="ts">
import { colorOf, iconOf } from '../utils/category'
import { isTruncated } from '../utils/ellipsis'
import type { Transaction } from '../types/api'

/**
 * 一条流水。流水页在桌面/手机上是同一套卡片行（不用 el-table：表格在手机上必横向滚动）。
 */
defineProps<{
  tx: Transaction
  actions?: boolean
}>()

const emit = defineEmits<{
  edit: [tx: Transaction]
  remove: [tx: Transaction]
  receipts: [tx: Transaction]
  /** 点了被省略号截断的文字：由页面弹出全文 */
  peek: [text: string, title: string]
}>()

function onPeek(event: MouseEvent, text: string | null, title: string): void {
  if (!text || !isTruncated(event.currentTarget)) return
  emit('peek', text, title)
}
</script>

<template>
  <article class="tx-item">
    <span class="tx-icon" :style="{ background: colorOf(tx.categoryColor) + '22' }">
      {{ iconOf(tx.categoryIcon) }}
    </span>

    <div class="tx-main">
      <div class="tx-line">
        <span class="tx-category" @click="onPeek($event, tx.categoryName, '分类')">{{
          tx.categoryName
        }}</span>
        <span class="tx-amount" :class="tx.type">
          {{ tx.type === 'income' ? '+' : '-' }}￥{{ tx.amount }}
        </span>
      </div>
      <div class="tx-line">
        <span class="tx-note" @click="onPeek($event, tx.note, '备注')">{{ tx.note || '—' }}</span>
        <span class="tx-tail">
          <button
            v-if="tx.receiptCount > 0"
            type="button"
            class="tx-receipt"
            :title="`${tx.receiptCount} 张票据`"
            @click="$emit('receipts', tx)"
          >
            📎 {{ tx.receiptCount }}
          </button>
          <span class="tx-date">{{ tx.transDate }}</span>
        </span>
      </div>
    </div>

    <div v-if="actions" class="tx-actions">
      <el-button text size="small" @click="$emit('edit', tx)">改</el-button>
      <el-button text size="small" type="danger" @click="$emit('remove', tx)">删</el-button>
    </div>
  </article>
</template>

<style scoped>
.tx-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
}

.tx-icon {
  flex: none;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 18px;
}

.tx-main {
  flex: 1;
  min-width: 0;
  display: grid;
  /* 隐式列默认 auto → 按 max-content 取宽，长备注会把整行撑到 871px */
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
}

.tx-line {
  display: flex;
  min-width: 0;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.tx-category {
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-amount {
  flex: none;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}

.tx-amount.income {
  color: #10b981;
}

.tx-amount.expense {
  color: #ef4444;
}

.tx-note,
.tx-date {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.tx-note {
  /* min-width:0：flex 子项默认 min-width:auto 会按整段 nowrap 文本取宽（实测 871px），
     既不省略也没法判断是否被截断 */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-tail {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* 票据徽标：只有真的有图才出现，点开看图集 */
.tx-receipt {
  border: none;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--el-fill-color);
  color: var(--el-text-color-regular);
  font-size: 11px;
  line-height: 18px;
  cursor: pointer;
}

.tx-receipt:hover {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.tx-actions {
  flex: none;
  display: flex;
}

/* 极窄屏：备注独占一行，日期与徽标留到下一行，避免日期被挤没 */
@media (max-width: 420px) {
  .tx-line {
    flex-wrap: wrap;
    row-gap: 2px;
  }

  .tx-note {
    flex: 1 1 100%;
  }
}
</style>