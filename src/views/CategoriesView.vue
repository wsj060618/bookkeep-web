<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createCategory, deleteCategories, deleteCategory, updateCategory } from '../api/category'
import { listBooks } from '../api/book'
import {
  createTemplate,
  createTemplateFromBook,
  deleteTemplate,
  listTemplates,
  updateTemplate,
} from '../api/template'
import CategoryFormDialog from '../components/CategoryFormDialog.vue'
import TemplateFormDialog from '../components/TemplateFormDialog.vue'
import { useShell } from '../composables/shell'
import { useAuthStore } from '../stores/auth'
import { colorOf, iconOf } from '../utils/category'
import type { Category, CategoryTemplate, TemplateItemInput, TxType } from '../types/api'

/**
 * 分类管理页。
 * <p>分类跟着**当前账本**走（切账本后 layout 换 key，本页重挂）；模板跟着**账号**走。
 * 模板在这里维护（新建 / 存为模板 / 编辑 / 删除），**选用**则发生在「新建账本」弹窗里。
 * <p>分类列表直接用 shell.categories 这份缓存当唯一数据源：改完只要 reloadCategories()，
 * 「记一笔」下拉、流水页筛选与本页会一起更新。
 */

const shell = useShell()
const auth = useAuthStore()

const GROUPS: { type: TxType; title: string; short: string }[] = [
  { type: 'expense', title: '支出分类', short: '支出' },
  { type: 'income', title: '收入分类', short: '收入' },
]

const loading = ref(false)
const busy = ref(false)

/* ---------- 模板 ---------- */

/** 内置模板的虚拟 id（后端约定 0，不入库） */
const BUILTIN_ID = 0

const templates = ref<CategoryTemplate[]>([])
const templateId = ref<number>(BUILTIN_ID)
const templateDialogVisible = ref(false)
const editingTemplate = ref<CategoryTemplate | null>(null)
const savingTemplate = ref(false)

const selectedTemplate = computed(
  () => templates.value.find((t) => t.id === templateId.value) ?? templates.value[0] ?? null,
)
const selectedIsBuiltin = computed(() => selectedTemplate.value?.builtin ?? true)

/* ---------- 所选模板的条目：直接在下面两张卡片里改 ---------- */

/**
 * 草稿：从所选模板同步过来，改动只落在本地，点「保存模板」才提交。
 * 与当前账本的分类完全无关——模板是账号级的，账本只是新建时复制了一份。
 */
const draftItems = ref<TemplateItemInput[]>([])
const savingItems = ref(false)

function syncDraft(): void {
  const template = selectedTemplate.value
  draftItems.value = template
    ? template.items.map((item) => ({
        name: item.name,
        type: item.type,
        icon: item.icon,
        color: item.color,
      }))
    : []
}

syncDraft()

const draftExpense = computed(() => draftItems.value.filter((item) => item.type === 'expense'))
const draftIncome = computed(() => draftItems.value.filter((item) => item.type === 'income'))

/** 有改动才允许保存（比较名称与方向的序列，够用且不需要深比较 icon） */
const templateDirty = computed(() => {
  const template = selectedTemplate.value
  if (!template) return false
  const before = template.items.map((item) => `${item.type}:${item.name}`)
  const after = draftItems.value.map((item) => `${item.type}:${item.name}`)
  return before.length !== after.length || before.some((value, index) => value !== after[index])
})

/** 切模板 / 刚保存完：把草稿对齐到选中模板 */
const lastTemplateId = ref<number>(BUILTIN_ID)
watch(
  () => selectedTemplate.value?.id,
  (id) => {
    lastTemplateId.value = id ?? BUILTIN_ID
    syncDraft()
  },
  { immediate: true },
)

async function onTemplateChange(): Promise<void> {
  if (!templateDirty.value) {
    syncDraft()
    return
  }
  const discard = await ElMessageBox.confirm(
    '当前模板还有没保存的改动，切换后这些改动会丢失。',
    '放弃改动？',
    { type: 'warning', confirmButtonText: '放弃', cancelButtonText: '继续编辑' },
  )
    .then(() => true)
    .catch(() => false)
  if (discard) {
    syncDraft()
    lastTemplateId.value = templateId.value
  } else {
    // 用户要继续编辑：把下拉还原到原来那套模板
    templateId.value = lastTemplateId.value
  }
}

/** 新增一条：只改草稿，保存时统一提交（后端按数组顺序编 sortOrder） */
async function onAddTemplateItem(type: TxType): Promise<void> {
  if (selectedIsBuiltin.value) return
  const result = await ElMessageBox.prompt(
    type === 'expense' ? '新支出分类的名称' : '新收入分类的名称',
    '添加模板分类',
    {
      confirmButtonText: '添加',
      cancelButtonText: '取消',
      inputPlaceholder: '如：班服、打印费',
      inputValidator: (value: string) => {
        const name = (value ?? '').trim()
        if (!name) return '名称不能为空'
        if (name.length > 20) return '名称不超过 20 个字'
        if (draftItems.value.some((item) => item.type === type && item.name === name)) {
          return '这套模板里已有同名分类'
        }
        return true
      },
    },
  ).catch(() => null)
  if (!result) return
  draftItems.value.push({
    name: result.value.trim(),
    type,
    icon: type === 'income' ? 'fee' : 'other',
    color: type === 'income' ? 'green' : 'orange',
  })
}

async function onRenameTemplateItem(item: TemplateItemInput): Promise<void> {
  if (selectedIsBuiltin.value) return
  const result = await ElMessageBox.prompt('修改后的名称', '重命名分类', {
    confirmButtonText: '保存',
    cancelButtonText: '取消',
    inputValue: item.name,
    inputValidator: (value: string) => {
      const name = (value ?? '').trim()
      if (!name) return '名称不能为空'
      if (name.length > 20) return '名称不超过 20 个字'
      if (name !== item.name
        && draftItems.value.some((other) => other !== item && other.type === item.type && other.name === name)) {
        return '这套模板里已有同名分类'
      }
      return true
    },
  }).catch(() => null)
  if (!result) return
  item.name = result.value.trim()
}

function onRemoveTemplateItem(item: TemplateItemInput): void {
  if (selectedIsBuiltin.value) return
  draftItems.value = draftItems.value.filter((other) => other !== item)
}

async function onSaveTemplateItems(): Promise<void> {
  const template = selectedTemplate.value
  if (!template || template.builtin || savingItems.value || !templateDirty.value) return
  if (draftItems.value.length === 0) {
    ElMessage.warning('模板至少保留一个分类')
    return
  }
  savingItems.value = true
  try {
    const saved = await updateTemplate(template.id, template.name, draftItems.value)
    await loadTemplates()
    templateId.value = saved.id
    syncDraft()
    ElMessage.success(`已保存「${saved.name}」`)
  } catch {
    // 校验失败等 400 已由拦截器提示
  } finally {
    savingItems.value = false
  }
}

/** 当前账本已归档 = 只读：不能增删改分类（模板是账号级的，仍可维护） */
const archived = computed(() => (auth.books.find((b) => b.current) ?? null)?.archived === true)

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

/** 删模板会把引用它的账本指回内置，所以 books 也要重拉 */
async function reloadBooks(): Promise<void> {
  auth.setBooks(await listBooks().catch(() => auth.books))
}

function onCreateTemplate(): void {
  editingTemplate.value = null
  templateDialogVisible.value = true
}

function onEditTemplate(): void {
  const template = selectedTemplate.value
  if (!template || template.builtin) return
  editingTemplate.value = template
  templateDialogVisible.value = true
}

async function onTemplateSubmit(payload: { name: string; items: TemplateItemInput[] }): Promise<void> {
  if (savingTemplate.value) return
  savingTemplate.value = true
  try {
    const template = editingTemplate.value
    const saved = template
      ? await updateTemplate(template.id, payload.name, payload.items)
      : await createTemplate(payload.name, payload.items)
    await loadTemplates()
    templateId.value = saved.id
    templateDialogVisible.value = false
    ElMessage.success(template ? `已保存「${saved.name}」` : `已新建模板「${saved.name}」`)
  } catch {
    // 重名等 400 已由拦截器弹出，弹窗保持打开让用户改
  } finally {
    savingTemplate.value = false
  }
}

async function onSaveAsTemplate(): Promise<void> {
  const result = await ElMessageBox.prompt(
    '把当前账本的分类复制成一个模板，以后新建账本时可以直接选它。',
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
    await reloadBooks()
    ElMessage.success('已删除模板')
  } catch {
    // 提示已由拦截器弹出
  }
}

/* ---------- 分类 ---------- */

const list = computed(() => shell.categories.value)
function byType(type: TxType): Category[] {
  return list.value.filter((c) => c.type === type)
}

/* ---------- 勾选与批量删除 ---------- */

const selectedCats = ref<number[]>([])
const batchBusy = ref(false)

/** 顶部「全选」：支出 + 收入一起选 */
const allCatsSelected = computed(
  () => list.value.length > 0 && selectedCats.value.length === list.value.length,
)
const someCatsSelected = computed(
  () => selectedCats.value.length > 0 && selectedCats.value.length < list.value.length,
)

function toggleAllCats(checked: boolean | string | number): void {
  selectedCats.value = checked ? list.value.map((c) => c.id) : []
}

/** 某一组（支出 / 收入）的勾选状态与全选 */
function groupIds(type: TxType): number[] {
  return byType(type).map((c) => c.id)
}
function groupAllSelected(type: TxType): boolean {
  const ids = groupIds(type)
  return ids.length > 0 && ids.every((id) => selectedCats.value.includes(id))
}
function groupSomeSelected(type: TxType): boolean {
  const ids = groupIds(type)
  const picked = ids.filter((id) => selectedCats.value.includes(id)).length
  return picked > 0 && picked < ids.length
}
/** 只动这一组的勾选，另一组保持原样 */
function toggleGroup(type: TxType, checked: boolean | string | number): void {
  const ids = groupIds(type)
  const rest = selectedCats.value.filter((id) => !ids.includes(id))
  selectedCats.value = checked ? [...rest, ...ids] : rest
}

async function onBatchDeleteCats(): Promise<void> {
  if (!selectedCats.value.length || batchBusy.value) return
  if (archived.value) {
    ElMessage.warning('当前账本已归档（学期结束），先取消归档再改分类')
    return
  }
  const count = selectedCats.value.length
  const confirmed = await ElMessageBox.confirm(
    `确定删除选中的 ${count} 个分类吗？其中任何一个下面还有流水，整批都会被拒绝。`,
    '批量删除分类',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  batchBusy.value = true
  try {
    const deleted = await deleteCategories(selectedCats.value)
    selectedCats.value = []
    await shell.reloadCategories()
    ElMessage.success(`已删除 ${deleted} 个分类`)
  } catch {
    // 被流水引用时后端 400，提示已由拦截器弹出
  } finally {
    batchBusy.value = false
  }
}

const dialogVisible = ref(false)
const editingCategory = ref<Category | null>(null)
const formType = ref<TxType>('expense')
const formInitial = ref<{ name: string; icon: string | null; color: string | null } | null>(null)
const saving = ref(false)

async function refresh(): Promise<void> {
  loading.value = true
  try {
    await shell.reloadCategories()
  } finally {
    loading.value = false
  }
}

function openCreate(type: TxType): void {
  if (archived.value) {
    ElMessage.warning('当前账本已归档（学期结束），先取消归档再改分类')
    return
  }
  editingCategory.value = null
  formType.value = type
  formInitial.value = null
  dialogVisible.value = true
}

function openEdit(category: Category): void {
  if (archived.value) {
    ElMessage.warning('当前账本已归档（学期结束），先取消归档再改分类')
    return
  }
  editingCategory.value = category
  formType.value = category.type
  formInitial.value = { name: category.name, icon: category.icon, color: category.color }
  dialogVisible.value = true
}

async function onCategorySubmit(payload: {
  name: string
  type: TxType
  icon: string
  color: string
}): Promise<void> {
  if (saving.value) return
  saving.value = true
  const editing = editingCategory.value
  try {
    if (editing) {
      await updateCategory(editing.id, payload)
    } else {
      await createCategory(payload)
    }
    dialogVisible.value = false
    await shell.reloadCategories()
    ElMessage.success(editing ? '已保存' : '已新增分类')
  } catch {
    // 分类名重复等 400 由拦截器统一弹出，弹窗保持打开让用户改
  } finally {
    saving.value = false
  }
}

async function onDelete(category: Category): Promise<void> {
  if (archived.value) {
    ElMessage.warning('当前账本已归档（学期结束），先取消归档再改分类')
    return
  }
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
        分类属于<b>当前账本</b>，换账本就换一套；模板属于<b>你的账号</b>，新建账本时可以直接选一套。
        <template v-if="archived">当前账本已归档，分类只读。</template>
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
        <el-select v-model="templateId" class="tpl-select" placeholder="选择模板" @change="onTemplateChange">
          <el-option
            v-for="t in templates"
            :key="t.id"
            :value="t.id"
            :label="t.builtin ? `${t.name}（内置）` : t.name"
          />
        </el-select>

        <el-button type="primary" @click="onCreateTemplate">新建模板</el-button>
        <el-button @click="onSaveAsTemplate">存为模板</el-button>
        <el-button :disabled="selectedIsBuiltin" @click="onEditTemplate">编辑</el-button>
        <el-button type="danger" plain :disabled="selectedIsBuiltin" @click="onDeleteTemplate">
          删除
        </el-button>
      </div>

      <p class="tpl-tip">
        下面两张卡片就是<b>所选模板</b>的分类，直接点条目改名、× 删除、底部「＋ 添加」。
        改完点「保存模板」才生效；内置模板只读，想改先「存为模板」复制一份。
        模板只属于账号，<b>不影响当前账本的分类</b>。
      </p>

      <div class="tpl-preview">
        <div class="tpl-col">
          <header class="tpl-col-head">
            支出<span class="tpl-col-count">{{ draftExpense.length }}</span>
          </header>
          <div class="tpl-items">
            <div v-for="item in draftExpense" :key="`expense-${item.name}`" class="tpl-item">
              <span class="tpl-item-name">{{ iconOf(item.icon) }} {{ item.name }}</span>
              <span v-if="!selectedIsBuiltin" class="tpl-item-actions">
                <el-button text size="small" @click="onRenameTemplateItem(item)">改名</el-button>
                <el-button text size="small" type="danger" @click="onRemoveTemplateItem(item)">删除</el-button>
              </span>
            </div>
            <p v-if="draftExpense.length === 0" class="tpl-empty">没有支出分类</p>
            <el-button
              v-if="!selectedIsBuiltin"
              text
              size="small"
              class="tpl-add"
              @click="onAddTemplateItem('expense')"
            >
              ＋ 添加支出分类
            </el-button>
          </div>
        </div>

        <div class="tpl-col">
          <header class="tpl-col-head">
            收入<span class="tpl-col-count">{{ draftIncome.length }}</span>
          </header>
          <div class="tpl-items">
            <div v-for="item in draftIncome" :key="`income-${item.name}`" class="tpl-item">
              <span class="tpl-item-name">{{ iconOf(item.icon) }} {{ item.name }}</span>
              <span v-if="!selectedIsBuiltin" class="tpl-item-actions">
                <el-button text size="small" @click="onRenameTemplateItem(item)">改名</el-button>
                <el-button text size="small" type="danger" @click="onRemoveTemplateItem(item)">删除</el-button>
              </span>
            </div>
            <p v-if="draftIncome.length === 0" class="tpl-empty">没有收入分类</p>
            <el-button
              v-if="!selectedIsBuiltin"
              text
              size="small"
              class="tpl-add"
              @click="onAddTemplateItem('income')"
            >
              ＋ 添加收入分类
            </el-button>
          </div>
        </div>
      </div>

      <div v-if="!selectedIsBuiltin" class="tpl-save">
        <span v-if="templateDirty" class="tpl-dirty">有未保存的改动</span>
        <el-button type="primary" :disabled="!templateDirty" :loading="savingItems" @click="onSaveTemplateItems">
          保存模板
        </el-button>
      </div>
    </section>

    <section class="batch-bar">
      <!-- 顶部是「全选全部」；每张卡片标题栏还有只针对本组的全选 -->
      <el-checkbox
        :model-value="allCatsSelected"
        :indeterminate="someCatsSelected"
        :disabled="archived || list.length === 0"
        @change="toggleAllCats"
      >
        全选
      </el-checkbox>
      <span class="batch-count">已选 {{ selectedCats.length }} / {{ list.length }} 个</span>
      <el-button
        type="danger"
        plain
        size="small"
        :disabled="!selectedCats.length || archived"
        :loading="batchBusy"
        @click="onBatchDeleteCats"
      >
        删除所选
      </el-button>
    </section>

    <section v-for="group in GROUPS" :key="group.type" class="cat-card">
      <header class="cat-head">
        <div class="cat-head-left">
          <!-- 全选按收支分组：支出、收入各自勾自己的，不混在一起 -->
          <el-checkbox
            :model-value="groupAllSelected(group.type)"
            :indeterminate="groupSomeSelected(group.type)"
            :disabled="archived || byType(group.type).length === 0"
            @change="(checked: boolean | string | number) => toggleGroup(group.type, checked)"
          >
            全选
          </el-checkbox>
          <h3 class="cat-title">{{ group.title }}</h3>
        </div>
        <el-button size="small" type="primary" plain :disabled="archived" @click="openCreate(group.type)">
          ＋ 新增{{ group.short }}
        </el-button>
      </header>

      <div v-loading="loading" class="cat-list">
        <p v-if="!loading && byType(group.type).length === 0" class="cat-empty">
          还没有{{ group.short }}分类，先新增一个，否则「记一笔」里没有可选项。
        </p>

        <div v-for="category in byType(group.type)" :key="category.id" class="cat-row">
          <el-checkbox v-model="selectedCats" :value="category.id" class="row-check" :disabled="archived" />
          <span class="cat-icon">{{ iconOf(category.icon) }}</span>
          <span class="cat-name">{{ category.name }}</span>
          <span class="cat-color" :style="{ background: colorOf(category.color) }" />
          <span class="cat-ops">
            <el-button text size="small" :disabled="archived" @click="openEdit(category)">编辑</el-button>
            <el-button text size="small" type="danger" :disabled="archived" @click="onDelete(category)">删除</el-button>
          </span>
        </div>
      </div>
    </section>

    <CategoryFormDialog
      v-model="dialogVisible"
      :type="formType"
      :initial="formInitial"
      :title="editingCategory ? '编辑分类' : undefined"
      :saving="saving"
      @submit="onCategorySubmit"
    />

    <TemplateFormDialog
      v-model="templateDialogVisible"
      :template="editingTemplate"
      :saving="savingTemplate"
      @submit="onTemplateSubmit"
    />
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

/* 所选模板的条目预览：支出 / 收入两列，切模板立刻变 */
.tpl-preview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
}

.tpl-col {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
  min-width: 0;
}

.tpl-col-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.tpl-col-count {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--el-fill-color);
  font-size: 11px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.tpl-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tpl-items {
  display: grid;
  gap: 4px;
}

.tpl-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 4px;
  border-radius: 6px;
}

.tpl-item:hover {
  background: var(--el-bg-color);
}

.tpl-item-name {
  font-size: 12px;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl-item-actions {
  flex: none;
  display: inline-flex;
  gap: 2px;
}

.tpl-add {
  justify-self: start;
  margin-top: 2px;
}

.tpl-save {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}

.tpl-dirty {
  font-size: 12px;
  color: var(--el-color-warning);
}

.tpl-chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--el-bg-color);
  font-size: 12px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
}

.tpl-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

@media (max-width: 767px) {
  .tpl-preview {
    grid-template-columns: 1fr;
  }
}

.cat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.cat-head-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
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

.batch-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 16px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.batch-count {
  margin-right: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.row-check {
  flex: none;
  margin-right: 0;
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

@media (max-width: 767px) {
  .cat-card {
    padding: 12px;
  }
}
</style>