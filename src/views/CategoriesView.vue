<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createCategory, deleteCategory, updateCategory } from '../api/category'
import { listBooks } from '../api/book'
import {
  applyTemplate,
  createTemplateFromBook,
  deleteTemplate,
  listTemplates,
  renameTemplate,
} from '../api/template'
import { useShell } from '../composables/shell'
import { useAuthStore } from '../stores/auth'
import { COLOR_CHOICES, ICON_CHOICES, colorOf, iconOf } from '../utils/category'
import type { Category, CategoryTemplate, TxType } from '../types/api'

/**
 * 分类管理：分类跟着当前账本走（切账本后 layout 换 key，本页重挂）；
 * 模板跟着**账号**走，在这里一键套用到当前账本。
 * 列表直接用 shell.categories 这份缓存当唯一数据源：改完只要 reloadCategories()，
 * 「记一笔」下拉、流水页筛选与本页会一起更新，不用各拉一份。
 */

const shell = useShell()
const auth = useAuthStore()

const GROUPS: { type: TxType; title: string; short: string }[] = [
  { type: 'expense', title: '支出分类', short: '支出' },
  { type: 'income', title: '收入分类', short: '收入' },
]

const loading = ref(false)
const saving = ref(false)
const busy = ref(false)

/* ---------- 模板 ---------- */

/** 内置模板的虚拟 id（后端约定 0，不入库） */
const BUILTIN_ID = 0

const templates = ref<CategoryTemplate[]>([])
const templateId = ref<number>(BUILTIN_ID)
const applying = ref(false)

const selectedTemplate = computed(
  () => templates.value.find((t) => t.id === templateId.value) ?? templates.value[0] ?? null,
)
const selectedIsBuiltin = computed(() => selectedTemplate.value?.builtin ?? true)

/** 账本记的是「基于哪套模板」；null 表示内置 */
function syncTemplateFromBook(): void {
  const current = auth.books.find((b) => b.current) ?? auth.books[0] ?? null
  templateId.value = current?.categoryTemplateId ?? BUILTIN_ID
}

async function loadTemplates(): Promise<void> {
  try {
    templates.value = await listTemplates()
  } catch {
    // 401 已由拦截器跳登录页，其余错误已弹提示
    return
  }
  // 模板被删掉后账本里可能留着旧 id：不在列表里就回落到内置
  if (!templates.value.some((t) => t.id === templateId.value)) {
    templateId.value = BUILTIN_ID
  }
}

/** 应用模板会换掉全部分类，账本里的 categoryTemplateId 也变了，两处都要刷新 */
async function refreshAfterApply(): Promise<void> {
  await shell.reloadCategories()
  auth.setBooks(await listBooks().catch(() => auth.books))
}

async function onApplyTemplate(): Promise<void> {
  const template = selectedTemplate.value
  if (!template || applying.value) return
  const confirmed = await ElMessageBox.confirm(
    `用「${template.name}」的 ${template.items.length} 个分类**替换**当前账本的全部分类。\n` +
      '只允许在没有流水的账本上换模板；换完后原有分类（含你手工改过的）会被覆盖。',
    '应用模板',
    { type: 'warning', confirmButtonText: '替换', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  applying.value = true
  try {
    await applyTemplate(template.id)
    await refreshAfterApply()
    ElMessage.success(`已应用「${template.name}」`)
  } catch {
    // 有流水时后端 400（提示已由拦截器弹出）
  } finally {
    applying.value = false
  }
}

async function onSaveAsTemplate(): Promise<void> {
  const result = await ElMessageBox.prompt(
    '把当前账本的分类存成一个模板，以后可以在任意账本上一键套用。',
    '存为模板',
    {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputPlaceholder: '模板名，如：秋季学期',
      inputValidator: (value: string) => (value?.trim() ? true : '模板名不能为空'),
    },
  ).catch(() => null)
  if (!result) return

  try {
    const created = await createTemplateFromBook(result.value.trim())
    await loadTemplates()
    templateId.value = created.id
    ElMessage.success(`已存为模板「${created.name}」`)
  } catch {
    // 重名等 400 已由拦截器弹出
  }
}

async function onRenameTemplate(): Promise<void> {
  const template = selectedTemplate.value
  if (!template || template.builtin) return
  const result = await ElMessageBox.prompt('给模板换一个名字', '重命名模板', {
    confirmButtonText: '保存',
    cancelButtonText: '取消',
    inputValue: template.name,
    inputValidator: (value: string) => (value?.trim() ? true : '模板名不能为空'),
  }).catch(() => null)
  if (!result) return

  try {
    await renameTemplate(template.id, result.value.trim())
    await loadTemplates()
    ElMessage.success('已重命名')
  } catch {
    // 重名等 400 已由拦截器弹出
  }
}

async function onDeleteTemplate(): Promise<void> {
  const template = selectedTemplate.value
  if (!template || template.builtin) return
  const confirmed = await ElMessageBox.confirm(
    `删除模板「${template.name}」后不可恢复；已经套用过它的账本不受影响（分类是复制过去的）。`,
    '删除模板',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  try {
    await deleteTemplate(template.id)
    templateId.value = BUILTIN_ID
    await loadTemplates()
    await refreshAfterApply()
    ElMessage.success('已删除模板')
  } catch {
    // 提示已由拦截器弹出
  }
}

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

onMounted(async () => {
  syncTemplateFromBook()
  await Promise.all([refresh(), loadTemplates()])
})
</script>

<template>
  <div class="cat-page">
    <div class="page-head">
      <h2 class="page-title">分类</h2>
      <p class="page-desc">
        分类属于<b>当前账本</b>，换账本就换一套；模板属于<b>你的账号</b>，可一键套用到任意账本。
      </p>
    </div>

    <section class="tpl-card">
      <header class="cat-head">
        <h3 class="cat-title">模板</h3>
        <span class="tpl-count">
          {{ selectedTemplate ? `${selectedTemplate.items.length} 个分类` : '' }}
        </span>
      </header>

      <div class="tpl-row">
        <el-select v-model="templateId" class="tpl-select" placeholder="选择模板">
          <el-option
            v-for="t in templates"
            :key="t.id"
            :value="t.id"
            :label="t.builtin ? `${t.name}（内置）` : t.name"
          />
        </el-select>

        <el-button type="primary" :loading="applying" @click="onApplyTemplate">
          应用到当前账本
        </el-button>
        <el-button @click="onSaveAsTemplate">存为模板</el-button>
        <el-button :disabled="selectedIsBuiltin" @click="onRenameTemplate">重命名</el-button>
        <el-button type="danger" plain :disabled="selectedIsBuiltin" @click="onDeleteTemplate">
          删除
        </el-button>
      </div>

      <p class="tpl-tip">
        「应用到当前账本」会用模板的分类<b>替换</b>现有分类，所以只允许在<b>没有流水</b>的账本上操作；
        「存为模板」是把当前账本的分类复制成一个新模板。
      </p>
    </section>

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
            @keydown.enter.prevent="onSubmit"
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

.tpl-card {
  margin-bottom: 16px;
  padding: 16px;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
}

.tpl-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.tpl-select {
  width: 220px;
  max-width: 100%;
}

.tpl-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.tpl-tip {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
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
