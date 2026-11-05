<script setup lang="ts">
import { colorOf, iconOf } from '../utils/category'
import type { Transaction } from '../types/api'

/**
 * 一条流水。列表在桌面/手机上是同一套卡片行（不用 el-table：表格在手机上必横向滚动）。
 * 概览页只读，流水页带「改/删」。
 */
defineProps<{
  tx: Transaction
  actions?: boolean
}>()

defineEmits<{
  edit: [tx: Transaction]
  remove: [tx: Transaction]
}>()
</script>

<template>
  <article class="tx-item">
    <span class="tx-icon" :style="{ background: colorOf(tx.categoryColor) + '22' }">
      {{ iconOf(tx.categoryIcon) }}
    </span>

    <div class="tx-main">
      <div class="tx-line">
        <span class="tx-category">{{ tx.categoryName }}</span>
        <span class="tx-amount" :class="tx.type">
          {{ tx.type === 'income' ? '+' : '-' }}￥{{ tx.amount }}
        </span>
      </div>
      <div class="tx-line">
        <span class="tx-note">{{ tx.note || '—' }}</span>
        <span class="tx-date">{{ tx.transDate }}</span>
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
  padding: 12px;
  border-radius: 10px;
  background: var(--el-bg-color);
  box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
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
  gap: 4px;
}

.tx-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.tx-category {
  font-weight: 600;
}

.tx-amount {
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-actions {
  flex: none;
  display: flex;
}
</style>