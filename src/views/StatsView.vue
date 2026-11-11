<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { fetchCategoryStat, fetchSummary } from '../api/statistic'
import CategoryChartCard from '../components/CategoryChartCard.vue'
import { useShell } from '../composables/shell'
import { useIsMobile } from '../composables/useIsMobile'
import type { CategoryStat, Summary, TxType } from '../types/api'
import { formatMoney } from '../utils/money'

/** 收支对比图按需加载（ECharts 只在真要画图时才拉） */
const CompareChart = defineAsyncComponent(() => import('../components/CompareChart.vue'))

/**
 * 统计页：默认看全部时间，可按日期区间筛选（精确到天）。
 * 卡片：收入 / 支出 / 结余（结余是区间末那天的账户余额，不是区间内的收支差）。
 * 「收支对比」图里那根「结余」柱仍是区间收支差，和卡片不同源（见 chartBalance）。
 * 改过流水（txVersion 变化）后要重拉，否则从流水页回来数字是旧的。
 */

const shell = useShell()
const isMobile = useIsMobile()

const loading = ref(false)
/** 空 = 全部时间；有值 = [开始日, 结束日]，都是 yyyy-MM-dd */
const dateRange = ref<[string, string] | null>(null)
/** 手机上的两个单日选择器：daterange 面板 646px，窄屏右半边（含「确定」）会跑出屏幕 */
const startDate = ref('')
const endDate = ref('')
const summary = ref<Summary | null>(null)
/** 两个方向一次都拉回来：并排展示，不需要再等第二次请求 */
const stats = ref<Record<TxType, CategoryStat[]>>({ expense: [], income: [] })

const rangeStart = computed(() => dateRange.value?.[0])
const rangeEnd = computed(() => dateRange.value?.[1])

/** 桌面选完区间，手机那两个框要跟着回显；反过来由 onMobileDateChange 同步 */
watch(dateRange, (value) => {
  startDate.value = value?.[0] ?? ''
  endDate.value = value?.[1] ?? ''
})

function onMobileDateChange(): void {
  // 只填一头等于没筛（后端把 null 当不限），这里要求两个都填
  dateRange.value = startDate.value && endDate.value ? [startDate.value, endDate.value] : null
  void load()
}

/** 重置按钮的可用性：手机上可能只填了一头，也要能重置 */
const hasRange = computed(() => !!(dateRange.value || startDate.value || endDate.value))

/**
 * 图里的「结余」柱一直是「区间收支差」（income − expense），和卡片上的「结余」（区间末账户余额）
 * 不是一个东西：余下几百块和「这段花了多少」放同一根坐标轴上量级差太远，柱子会失衡。
 */
const chartBalance = computed(() => {
  const net = Number(summary.value?.income ?? 0) - Number(summary.value?.expense ?? 0)
  return net.toFixed(2)
})

/** 页面上显示的区间文字 */
const rangeText = computed(() => {
  if (!rangeStart.value && !rangeEnd.value) return '全部时间'
  return `${rangeStart.value || '最早'} ~ ${rangeEnd.value || '今天'}`
})

async function load(): Promise<void> {
  loading.value = true
  try {
    const [resp, expense, income] = await Promise.all([
      fetchSummary(rangeStart.value, rangeEnd.value),
      fetchCategoryStat(rangeStart.value, rangeEnd.value, 'expense'),
      fetchCategoryStat(rangeStart.value, rangeEnd.value, 'income'),
    ])
    summary.value = resp
    stats.value = { expense, income }
  } catch {
    summary.value = null
    stats.value = { expense: [], income: [] }
  } finally {
    loading.value = false
  }
}

/** 重置：清空区间（含手机上那两个单日框），回到「全部时间」 */
function onReset(): void {
  dateRange.value = null
  startDate.value = ''
  endDate.value = ''
  void load()
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
      </div>
      <div class="head-actions">
        <!-- 手机上 daterange 的面板宽 646px，右半边（含「确定」）会跑出屏幕：
             换成两个单日选择器，两个都填才生效 -->
        <template v-if="isMobile">
          <el-date-picker
            v-model="startDate"
            class="date-picker"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="开始日期"
            @change="onMobileDateChange"
          />
          <el-date-picker
            v-model="endDate"
            class="date-picker"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="结束日期"
            @change="onMobileDateChange"
          />
        </template>
        <el-date-picker
          v-else
          v-model="dateRange"
          class="date-picker range-picker"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          unlink-panels
          @change="load"
        />
        <el-button :disabled="!hasRange" @click="onReset">重置</el-button>
      </div>
    </div>

    <section v-loading="loading" class="numbers">
      <div class="num">
        <span class="num-label">收入</span>
        <span class="num-value income">+￥{{ summary?.income ?? '0.00' }}</span>
      </div>
      <div class="num">
        <span class="num-label">支出</span>
        <span class="num-value expense">-￥{{ summary?.expense ?? '0.00' }}</span>
      </div>
      <div class="num">
        <span class="num-label">结余</span>
        <span class="num-value strong">{{ formatMoney(summary?.balance) }}</span>
      </div>
    </section>

    <section v-loading="loading" class="panel">
      <div class="panel-head">
        <h3 class="panel-title">收支对比</h3>
        <span class="panel-range">{{ rangeText }}</span>
      </div>

      <div class="charts-row">
        <div class="compare-card">
          <header class="compare-head">金额对比（柱状）</header>
          <CompareChart
            type="bar"
            :income="summary?.income ?? '0.00'"
            :expense="summary?.expense ?? '0.00'"
            :balance="chartBalance"
          />
        </div>
        <div class="compare-card">
          <header class="compare-head">收支占比（环形）</header>
          <CompareChart
            type="donut"
            :income="summary?.income ?? '0.00'"
            :expense="summary?.expense ?? '0.00'"
            :balance="chartBalance"
          />
        </div>
      </div>
    </section>

    <section v-loading="loading" class="panel">
      <div class="panel-head">
        <h3 class="panel-title">分类占比</h3>
        <span class="panel-range">{{ rangeText }}</span>
      </div>

      <div class="charts-row">
        <CategoryChartCard title="收入" tone="income" :items="stats.income" />
        <CategoryChartCard title="支出" tone="expense" :items="stats.expense" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.stats-page {
  display: grid;
  /* minmax(0, 1fr)：子项默认 min-width:auto，日期框的 min-content 会把整页撑宽
     （手机上表现为整页横向溢出、顶部导航栏却不跟着变宽） */
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

.page-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 18px;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* :deep 是因为 el-date-picker 的根元素挂在 el-tooltip 下，拿不到本组件的 scope id，
   不写 :deep 的 .date-picker 规则一条都不生效（实测还是 Element 的 220px / 350px） */
.head-actions :deep(.date-picker) {
  width: 230px;
  min-width: 0;
}

.head-actions :deep(.range-picker) {
  width: 320px;
}

.numbers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr));
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
  min-height: 160px;
}

.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 12px;
  margin-bottom: 8px;
}

.panel-title {
  margin: 0;
  font-size: 14px;
}

.panel-range {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.charts-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.compare-card {
  min-width: 0;
  padding: 12px;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.compare-head {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

@media (max-width: 900px) {
  .charts-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .charts-row {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 520px) {
  .numbers {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .num-value {
    font-size: 18px;
  }

  /* 两个单日框并排，重置按钮落到第二行整行 */
  .head-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .head-actions :deep(.date-picker) {
    width: 100%;
  }

  .head-actions :deep(.el-button) {
    grid-column: 1 / -1;
    width: 100%;
    margin-left: 0;
  }
}
</style>