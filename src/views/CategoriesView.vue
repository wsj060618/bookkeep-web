<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createCategory, deleteCategory, updateCategory } from '../api/category'
import { useShell } from '../composables/shell'
import { COLOR_CHOICES, ICON_CHOICES, colorOf, iconOf } from '../utils/category'
import type { Category, TxType } from '../types/api'

/**
 * 分类管理：按账本的一套数据，跟着当前账本走（切账本后 layout 换 key，本页重挂）。
 * 列表直接用 shell.categories 这份缓存当唯一数据源：改完只要 reloadCategories()，
 * 「记一笔」下拉、流水页筛选与本页会一起更新，不用各拉一份。
 */

const shell = useShell()

const GROUPS: { type: TxType; title: string; short: string }[] = [
  { type: 'expense', title: '支出分类', short: '支出' },
  { type: 'income', title: '收入分类', short: '收入' },
]

const loading = ref(false)
const saving = ref(false)
const busy = ref(false)

const list = computed(() => shell.categories.value)
function byType(type: TxType): Category[] {
  return list.value.filter((c) => c.type === type)
}

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({
  name: '',
  type: 'expense' as TxType,
  icon: 'other',
  color: 'orange',
})

const dialogTitle = computed(() => (editingId.value === null ? '新增分类' : '编辑分类'))

async function refresh(): Promise<void> {
  loading.value = true
  try {
    await shell.reloadCategories()
  } finally {
    loading.value = false
  }
}

function openCreate(type: TxType): void {
  editingId.value = null
  form.name = ''
  form.type = type
  form.icon = 'other'
  form.color = type === 'expense' ? 'orange' : 'green'
  dialogVisible.value = true
}

function openEdit(category: Category): void {
  editingId.value = category.id
  form.name = category.name
  form.type = category.type
  form.icon = category.icon ?? 'other'
  form.color = category.color ?? 'gray'
  dialogVisible.value = true
}

async function onSubmit(): Promise<void> {
  const name = form.name.trim()
  if (!name) {
    ElMessage.warning('分类名不能为空')
    return
  }
  if (saving.value) return
  saving.value = true
  const creating = editingId.value === null
  try {
    const req = { name, type: form.type, icon: form.icon, color: form.color }
    if (creating) {
      await createCategory(req)
    } else {
      await updateCategory(editingId.value as number, req)
    }
    dialogVisible.value = false
    await shell.reloadCategories()
    ElMessage.success(creating ? '已新增分类' : '已保存')
  } catch {
    // 分类名重复等 400 由拦截器统一弹出，弹窗保持打开让用户改
  } finally {
    saving.value = false
  }
}

async function onDelete(category: Category): Promise<void> {
  if (busy.value) return
  const confirmed = await ElMessageBox.confirm(
    `「${category.name}」删除后不可恢复；它下面还有流水时后端会拒绝并告诉你笔数。`,
    '删除分类',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  busy.value = true
  try {
    await deleteCategory(category.id)
    await shell.reloadCategories()
    ElMessage.success('已删除')
  } catch {
    // 有流水时后端 400（提示已由拦截器弹出）
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="cat-page">
    <div class="page-head">
      <h2 class="page-title">分类</h2>
      <p class="page-desc">
        分类属于<b>当前账本</b>，换账本就换一套；「记一笔」里也能直接新建并选中。
      </p>
    </div>

    <section v-for="group in GROUPS" :key="group.type" class="cat-card">
      <header class="cat-head">
        <h3 class="cat-title">{{ group.title }}</h3>
        <el-button size="small" type="primary" plain @click="openCreate(group.type)">
          ＋ 新增{{ group.short }}
        </el-button>
      </header>

      <div v-loading="loading" class="cat-list">
        <p v-if="!loading && byType(group.type).length === 0" class="cat-empty">
          还没有{{ group.short }}分类，先新增一个，否则「记一笔」里没有可选项。
        </p>

        <div v-for="category in byType(group.type)" :key="category.id" class="cat-row">
          <span class="cat-icon">{{ iconOf(category.icon) }}</span>
          <span class="cat-name">{{ category.name }}</span>
          <span class="cat-color" :style="{ background: colorOf(category.color) }" />
          <span class="cat-ops">
            <el-button text size="small" @click="openEdit(category)">编辑</el-button>
            <el-button text size="small" type="danger" @click="onDelete(category)">删除</el-button>
          </span>
        </div>
      </div>
    </section>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="min(460px, 92vw)" destroy-on-close>
      <el-form label-position="top" @submit.prevent="onSubmit">
        <el-form-item label="分类名">
          <el-input
            v-model="form.name"
            maxlength="50"
            show-word-limit
            placeholder="如：打印费"
            @keyup.enter="onSubmit"
          />
        </el-form-item>

        <el-form-item v-if="editingId === null" label="收支方向">
          <el-radio-group v-model="form.type">
            <el-radio-button value="expense">支出</el-radio-button>
            <el-radio-button value="income">收入</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="图标">
          <div class="picker">
            <button
              v-for="opt in ICON_CHOICES"
              :key="opt.key"
              type="button"
              class="pick"
              :class="{ active: form.icon === opt.key }"
              :title="opt.label"
              @click="form.icon = opt.key"
            >
              {{ opt.emoji }}
            </button>
          </div>
        </el-form-item>

        <el-form-item label="颜色">
          <div class="picker">
            <button
              v-for="opt in COLOR_CHOICES"
              :key="opt.key"
              type="button"
              class="pick color"
              :class="{ active: form.color === opt.key }"
              :title="opt.label"
              :style="{ background: opt.hex }"
              @click="form.color = opt.key"
            />
          </div>
        </el-form-item>

        <p v-if="editingId !== null" class="dialog-tip">
          收支方向创建后不能改：改了会让这个分类下的历史流水收支方向失真。
        </p>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-head {
  margin-bottom: 16px;
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

.cat-card {
  margin-bottom: 16px;
  padding: 16px;
  border-radius: 10px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
}

.cat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.cat-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.cat-list {
  display: grid;
  gap: 4px;
  min-height: 40px;
}

.cat-empty {
  margin: 0;
  padding: 12px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.cat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}

.cat-icon {
  flex: none;
  width: 22px;
  text-align: center;
  font-size: 16px;
}

.cat-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.cat-color {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.cat-ops {
  display: flex;
  flex: none;
}

.picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pick {
  width: 34px;
  height: 34px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  cursor: pointer;
}

.pick.color {
  border-width: 3px;
  border-color: transparent;
}

.pick.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
}

.dialog-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

@media (max-width: 767px) {
  .cat-card {
    padding: 12px;
  }
}
</style>
