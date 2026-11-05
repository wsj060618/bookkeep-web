<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchCategoryStat, fetchSummary } from '../api/statistic'
import { pageTransactions } from '../api/transaction'
import { colorOf, iconOf } from '../utils/category'
import { useShell } from '../composables/shell'
import TxItem from '../components/TxItem.vue'
import type { CategoryStat, Summary, Transaction } from '../types/api'

/**
 * 概览：本月统计 + 最近 10 笔。
 * 桌面 ≥1024 时左侧统计（sticky）、右侧最近流水；手机仍是单列上下排。
 */

const router = useRouter()
const shell = useShell()

const statLoading = ref(false)
/** 空字符串 = 当月，由后端按 Asia/Shanghai 决定；回显后用后端返回的 month */
const statMonth = ref('')
const summary = ref<Summary | null>(null)
const categoryStats = ref<CategoryStat[]>([])

const topCategories = computed(() => categoryStats.value.slice(0, 5))

const recent = ref<Transaction[]>([])
const recentLoading = ref(false)

async function loadStats(): Promise<void> {
  statLoading.value = true
  try {
    const month = statMonth.value || undefined
    const [resp, stats] = await Promise.all([fetchSummary(month), fetchCategoryStat(month, 'expense')])
    summary.value = resp
    categoryStats.value = stats
    statMonth.value = resp.month
  } catch {
    summary.value = null
    categoryStats.value = []
  } finally {
    statLoading.value = false
  }
}

async function loadRecent(): Promise<void> {
  recentLoading.value = true
  try {
    recent.value = (await pageTransactions({ page: 1, size: 10 })).list
  } catch {
    recent.value = []
  } finally {
    recentLoading.value = false
  }
}

// 记一笔 / 改 / 删 都会让 layout 的 txVersion +1
watch(shell.txVersion, () => {
  void loadStats()
  void loadRecent()
})

onMounted(() => {
  void loadStats()
  void loadRecent()
})
</script>

<template>
  <div class="dash">
    <section v-loading="statLoading" class="stats">
      <div class="stats-head">
        <span class="stats-title">收支统计</span>
        <el-date-picker
          v-model="statMonth"
          class="stats-month"
          type="month"
          value-format="YYYY-MM"
          placeholder="选择月份"
          :clearable="false"
          @change="loadStats"
        />
      </div>

      <div class="stats-numbers">
        <div class="stat">
          <span class="stat-label">本月收入</span>
          <span class="stat-value income">+￥{{ summary?.income ?? '0.00' }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">本月支出</span>
          <span class="stat-value expense">-￥{{ summary?.expense ?? '0.00' }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">本月结余</span>
          <span class="stat-value">￥{{ summary?.balance ?? '0.00' }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">累计结余</span>
          <span class="stat-value strong">￥{{ summary?.totalBalance ?? '0.00' }}</span>
        </div>
      </div>

      <div v-if="topCategories.length" class="category-stats">
        <div v-for="c in topCategories" :key="c.categoryId" class="category-row">
          <span class="category-name">{{ iconOf(c.categoryIcon) }} {{ c.categoryName }}</span>
          <span class="category-bar">
            <span
              class="category-bar-inner"
              :style="{ width: `${c.percent}%`, background: colorOf(c.categoryColor) }"
            />
          </span>
          <span class="category-amount">￥{{ c.amount }}</span>
          <span class="category-percent">{{ c.percent }}%</span>
        </div>
      </div>
      <p v-else class="stats-empty">本月还没有支出，分类占比暂时为空</p>
    </section>

    <section class="recent">
      <div class="recent-head">
        <span class="recent-title">最近流水</span>
        <el-button text type="primary" @click="router.push({ name: 'transactions' })">
          查看全部 →
        </el-button>
      </div>

      <div v-loading="recentLoading" class="recent-list">
        <el-empty v-if="!recentLoading && recent.length === 0" description="还没有流水，点「记一笔」开始" />
        <TxItem v-for="tx in recent" :key="tx.id" :tx="tx" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.dash {
  display: grid;
  gap: 16px;
}

.stats {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
}

.stats-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stats-title {
  font-size: 13px;
  opacity: 0.9;
}

.stats-month {
  width: 130px;
}

.stats-numbers {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.stat {
  display: grid;
  gap: 2px;
}

.stat-label {
  font-size: 11px;
  opacity: 0.8;
}

.stat-value {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stat-value.strong {
  font-size: 16px;
}

.stat-value.income {
  color: #bbf7d0;
}

.stat-value.expense {
  color: #fecaca;
}

.category-stats {
  display: grid;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid rgb(255 255 255 / 20%);
}

.category-row {
  display: grid;
  grid-template-columns: 90px 1fr 78px 52px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.category-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-bar {
  height: 6px;
  border-radius: 3px;
  background: rgb(255 255 255 / 25%);
  overflow: hidden;
}

.category-bar-inner {
  display: block;
  height: 100%;
  border-radius: 3px;
}

.category-amount,
.category-percent {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.stats-empty {
  margin: 0;
  font-size: 12px;
  opacity: 0.8;
}

.recent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.recent-title {
  font-size: 14px;
  font-weight: 600;
}

.recent-list {
  min-height: 120px;
  display: grid;
  gap: 8px;
}

@media (max-width: 520px) {
  .stats-numbers {
    grid-template-columns: repeat(2, 1fr);
  }

  .category-row {
    grid-template-columns: 80px 1fr 70px 46px;
  }
}

/* 桌面：左统计（sticky）右流水，把 1440 的宽度用起来 */
@media (min-width: 1024px) {
  .dash {
    grid-template-columns: 380px minmax(0, 1fr);
    align-items: start;
    gap: 24px;
  }

  .stats {
    position: sticky;
    top: 88px;
  }
}
</style>