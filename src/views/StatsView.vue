<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { fetchCategoryStat, fetchSummary } from '../api/statistic'
import { colorOf, iconOf } from '../utils/category'
import { useShell } from '../composables/shell'
import type { CategoryStat, Summary } from '../types/api'

/**
 * 统计页：按月看收支与分类占比。
 * 改过流水（txVersion 变化）后要重拉，否则从流水页回来数字是旧的。
 */

const shell = useShell()

const loading = ref(false)
/** 空字符串 = 当月，由后端按 Asia/Shanghai 决定；回显后用后端返回的 month */
const month = ref('')
const summary = ref<Summary | null>(null)
const categories = ref<CategoryStat[]>([])

async function load(): Promise<void> {
  loading.value = true
  try {
    const m = month.value || undefined
    const [resp, stats] = await Promise.all([fetchSummary(m), fetchCategoryStat(m, 'expense')])
    summary.value = resp
    categories.value = stats
    month.value = resp.month
  } catch {
    summary.value = null
    categories.value = []
  } finally {
    loading.value = false
  }
}

watch(shell.txVersion, () => {
  void load()
})

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="stats-page">
    <div class="page-head">
      <div>
        <h2 class="page-title">收支统计</h2>
        <p class="page-desc">按月汇总当前账本；分类占比只统计支出。</p>
      </div>
      <el-date-picker
        v-model="month"
        class="month-picker"
        type="month"
        value-format="YYYY-MM"
        placeholder="选择月份"
        :clearable="false"
        @change="load"
      />
    </div>

    <section v-loading="loading" class="numbers">
      <div class="num">
        <span class="num-label">本月收入</span>
        <span class="num-value income">+￥{{ summary?.income ?? '0.00' }}</span>
      </div>
      <div class="num">
        <span class="num-label">本月支出</span>
        <span class="num-value expense">-￥{{ summary?.expense ?? '0.00' }}</span>
      </div>
      <div class="num">
        <span class="num-label">本月结余</span>
        <span class="num-value">￥{{ summary?.balance ?? '0.00' }}</span>
      </div>
      <div class="num">
        <span class="num-label">累计结余</span>
        <span class="num-value strong">￥{{ summary?.totalBalance ?? '0.00' }}</span>
      </div>
    </section>

    <section v-loading="loading" class="panel">
      <div class="panel-head">
        <h3 class="panel-title">支出分类占比</h3>
        <span class="panel-month">{{ summary?.month ?? '' }}</span>
      </div>

      <div v-if="categories.length" class="cat-grid">
        <div v-for="c in categories" :key="c.categoryId" class="cat-row">
          <span class="cat-name">{{ iconOf(c.categoryIcon) }} {{ c.categoryName }}</span>
          <span class="cat-bar">
            <span
              class="cat-bar-inner"
              :style="{ width: `${c.percent}%`, background: colorOf(c.categoryColor) }"
            />
          </span>
          <span class="cat-amount">￥{{ c.amount }}</span>
          <span class="cat-percent">{{ c.percent }}%</span>
        </div>
      </div>
      <el-empty v-else description="这个月还没有支出" />
    </section>
  </div>
</template>

<style scoped>
.stats-page {
  display: grid;
  gap: 16px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 18px;
}

.page-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.month-picker {
  width: 140px;
  flex: none;
}

.numbers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  min-height: 90px;
}

.num {
  display: grid;
  gap: 6px;
  padding: 16px;
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
}

.num-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.num-value {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.num-value.income {
  color: #10b981;
}

.num-value.expense {
  color: #ef4444;
}

.num-value.strong {
  color: var(--el-color-primary);
}

.panel {
  padding: 16px;
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
  min-height: 160px;
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-title {
  margin: 0;
  font-size: 14px;
}

.panel-month {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 10px 32px;
}

.cat-row {
  display: grid;
  grid-template-columns: 110px 1fr 84px 52px;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.cat-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--el-fill-color);
  overflow: hidden;
}

.cat-bar-inner {
  display: block;
  height: 100%;
  border-radius: 4px;
}

.cat-amount,
.cat-percent {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.cat-percent {
  color: var(--el-text-color-secondary);
}

@media (max-width: 520px) {
  .numbers {
    grid-template-columns: repeat(2, 1fr);
  }

  .num-value {
    font-size: 18px;
  }

  .cat-grid {
    grid-template-columns: 1fr;
  }

  .cat-row {
    grid-template-columns: 86px 1fr 76px 46px;
  }
}
</style>