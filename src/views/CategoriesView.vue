<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
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
import type { CategoryTemplate, TemplateItemInput, TxType } from '../types/api'

/**
 * 分类模板页：两张卡片就是所选模板的条目，改一条存一条（没有草稿和保存按钮）。
 * 保存会同步到用过这套模板的账本。
 */

const auth = useAuthStore()
/** 「记一笔」弹窗用的是 layout 里的分类缓存，模板改完要让它重拉一次 */
const shell = useShell()

const GROUPS: { type: TxType; title: string; short: string }[] = [
  { type: 'expense', title: '支出分类', short: '支出' },
  { type: 'income', title: '收入分类', short: '收入' },
]

/** 内置模板的虚拟 id */
const BUILTIN_ID = 0

const templates = ref<CategoryTemplate[]>([])
const templateId = ref<number>(BUILTIN_ID)
const templateDialogVisible = ref(false)
const savingTemplate = ref(false)

const selectedTemplate = computed(
  () => templates.value.find((t) => t.id === templateId.value) ?? templates.value[0] ?? null,
)
const selectedIsBuiltin = computed(() => selectedTemplate.value?.builtin ?? true)

const items = ref<TemplateItemInput[]>([])
const saving = ref(false)
/** 必须声明在下面的 immediate watcher 之前，否则会触发 TDZ */
const selectedKeys = ref<string[]>([])

function syncItems(): void {
  const template = selectedTemplate.value
  items.value = template
    ? template.items.map((item) => ({
        // id 决定后端这次是「改名」还是「删旧建新」
        id: item.id,
        name: item.name,
        type: item.type,
        icon: item.icon,
        color: item.color,
      }))
    : []
}

/** 选中模板变了（含首次加载）→ 本地列表重新对齐；这是唯一的数据来源，避免串到上一套模板 */
watch(
  () => selectedTemplate.value?.id,
  () => {
    syncItems()
    selectedKeys.value = []
  },
  { immediate: true },
)

/** 下拉是单向绑定，切换必须由这里写 templateId，否则选中值和列表会对不上 */
function onTemplateChange(next: number): void {
  if (next === templateId.value) return
  templateId.value = next
  syncItems()
  selectedKeys.value = []
}

/** 把整份条目写回后端；失败时重新拉列表，避免界面和后端不一致 */
async function persist(next: TemplateItemInput[], success: string): Promise<boolean> {
  const template = selectedTemplate.value
  if (!template || template.builtin || saving.value) return false
  if (next.length === 0) {
    ElMessage.warning('模板至少保留一个分类')
    return false
  }
  saving.value = true
  try {
    await updateTemplate(template.id, template.name, next)
    await loadTemplates()
    // 账本分类已经跟着变了 → 让「记一笔」/流水筛选那份缓存重拉
    await shell.reloadCategories()
    ElMessage.success(success)
    return true
  } catch {
    await loadTemplates()
    return false
  } finally {
    saving.value = false
  }
}

/* ---------- 条目增删改：每一处都直接落库 ---------- */

function itemKey(item: TemplateItemInput): string {
  return `${item.type}|${item.name}`
}

function byType(type: TxType): TemplateItemInput[] {
  return items.value.filter((item) => item.type === type)
}

const dialogVisible = ref(false)
const editingItem = ref<TemplateItemInput | null>(null)
const formType = ref<TxType>('expense')
const formInitial = ref<{ name: string; icon: string | null; color: string | null } | null>(null)

/** 只有账号一套模板都没有时才会拿到 id=0 的只读投影，编辑前先复制成真实模板 */
async function ensureEditableTemplate(): Promise<boolean> {
  if (!selectedIsBuiltin.value) return true
  const confirmed = await ElMessageBox.confirm(
    '这一套是内置的只读模板。要复制一份到你账号下再编辑吗？',
    '先复制一份',
    { confirmButtonText: '复制并编辑', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return false

  // 名称去重：班级班费（副本）/（副本2）…
  const base = `${selectedTemplate.value?.name ?? '模板'}（副本）`
  const taken = new Set(templates.value.map((t) => t.name))
  let name = base
  for (let i = 2; taken.has(name); i++) {
    name = `${base}${i}`
  }
  try {
    // 复制出来的是新模板，条目 id 必须去掉
    const clone = await createTemplate(
      name,
      items.value.map(({ id: _id, ...rest }) => rest),
    )
    await loadTemplates()
    templateId.value = clone.id
    syncItems()
    ElMessage.success(`已复制为「${clone.name}」，现在可以改了`)
    return true
  } catch {
    // 重名等 400 已由拦截器提示
    return false
  }
}

async function openCreate(type: TxType): Promise<void> {
  if (!(await ensureEditableTemplate())) return
  editingItem.value = null
  formType.value = type
  formInitial.value = null
  dialogVisible.value = true
}

async function openEdit(item: TemplateItemInput): Promise<void> {
  if (!(await ensureEditableTemplate())) return
  editingItem.value = item
  formType.value = item.type
  formInitial.value = { name: item.name, icon: item.icon, color: item.color }
  dialogVisible.value = true
}

/** 提交即保存，成功才关弹窗 */
async function onItemSubmit(payload: {
  name: string
  type: TxType
  icon: string
  color: string
}): Promise<void> {
  const duplicate = items.value.some(
    (item) => item.type === payload.type && item.name === payload.name && item !== editingItem.value,
  )
  if (duplicate) {
    ElMessage.warning('这套模板里已有同名分类')
    return
  }
  const editing = editingItem.value
  // 编辑时保留原 id，后端才会「改这一条」而不是「删旧建新」
  const next = editing
    ? items.value.map((item) => (item === editing ? { ...item, ...payload } : item))
    : [...items.value, payload]
  const ok = await persist(next, editing ? `已修改「${payload.name}」` : `已新增「${payload.name}」`)
  if (ok) dialogVisible.value = false
}

async function onDelete(item: TemplateItemInput): Promise<void> {
  if (!(await ensureEditableTemplate())) return
  const confirmed = await ElMessageBox.confirm(
    `删掉「${item.name}」？会同步删掉账本里的同名分类（已有流水的会被拦下）。`,
    '删除分类',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  await persist(
    items.value.filter((other) => other !== item),
    `已删除「${item.name}」`,
  )
}

/* ---------- 勾选与批量删除 ---------- */

const allSelected = computed(
  () => items.value.length > 0 && selectedKeys.value.length === items.value.length,
)
const someSelected = computed(
  () => selectedKeys.value.length > 0 && selectedKeys.value.length < items.value.length,
)

function toggleAll(checked: boolean | string | number): void {
  selectedKeys.value = checked ? items.value.map(itemKey) : []
}

/** selectedKeys 是普通数组，用 includes 驱动复选框 */
function toggleKey(key: string, checked: boolean | string | number): void {
  const rest = selectedKeys.value.filter((value) => value !== key)
  selectedKeys.value = checked ? [...rest, key] : rest
}

function groupKeys(type: TxType): string[] {
  return byType(type).map(itemKey)
}

function groupAllSelected(type: TxType): boolean {
  const keys = groupKeys(type)
  return keys.length > 0 && keys.every((key) => selectedKeys.value.includes(key))
}

function groupSomeSelected(type: TxType): boolean {
  const keys = groupKeys(type)
  const picked = keys.filter((key) => selectedKeys.value.includes(key)).length
  return picked > 0 && picked < keys.length
}

function toggleGroup(type: TxType, checked: boolean | string | number): void {
  const keys = groupKeys(type)
  const rest = selectedKeys.value.filter((key) => !keys.includes(key))
  selectedKeys.value = checked ? [...rest, ...keys] : rest
}

async function onBatchDelete(): Promise<void> {
  if (!(await ensureEditableTemplate())) return
  if (!selectedKeys.value.length) return
  const count = selectedKeys.value.length
  const confirmed = await ElMessageBox.confirm(
    `删除选中的 ${count} 个分类？会同步删掉账本里的对应分类（已有流水的会被拦下）。`,
    '批量删除分类',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  const keys = new Set(selectedKeys.value)
  const ok = await persist(
    items.value.filter((item) => !keys.has(itemKey(item))),
    `已删除 ${count} 个分类`,
  )
  if (ok) selectedKeys.value = []
}

/* ---------- 模板本身：新建 / 存为 / 重命名 / 删除 ---------- */

/** 列表变更后把本地对齐到最新；选中项必须是列表里真实存在的一项（老账本可能是 NULL → id=0） */
async function loadTemplates(): Promise<void> {
  try {
    templates.value = await listTemplates()
  } catch {
    return
  }
  if (!templates.value.some((t) => t.id === templateId.value)) {
    templateId.value = templates.value[0]?.id ?? BUILTIN_ID
  }
  syncItems()
}

/** 删模板后账本会指回内置，books 也要重拉 */
async function reloadBooks(): Promise<void> {
  auth.setBooks(await listBooks().catch(() => auth.books))
}

function onCreateTemplate(): void {
  templateDialogVisible.value = true
}

async function onTemplateSubmit(payload: { name: string; items: TemplateItemInput[] }): Promise<void> {
  if (savingTemplate.value) return
  savingTemplate.value = true
  try {
    const saved = await createTemplate(payload.name, payload.items)
    await loadTemplates()
    templateId.value = saved.id
    templateDialogVisible.value = false
    ElMessage.success(`已新建模板「${saved.name}」`)
  } catch {
    // 重名等 400 已由拦截器弹出，弹窗保持打开让用户改
  } finally {
    savingTemplate.value = false
  }
}

async function onSaveAsTemplate(): Promise<void> {
  const result = await ElMessageBox.prompt(
    '把当前账本的分类复制成一个新模板，以后新建账本时可以直接选它。',
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
  const result = await ElMessageBox.prompt('模板名', '重命名模板', {
    confirmButtonText: '保存',
    cancelButtonText: '取消',
    inputValue: template.name,
    inputValidator: (value: string) => (value?.trim() ? true : '模板名不能为空'),
  }).catch(() => null)
  if (!result) return
  try {
    const saved = await updateTemplate(template.id, result.value.trim())
    await loadTemplates()
    templateId.value = saved.id
    ElMessage.success('已重命名')
  } catch {
    // 重名等 400 已由拦截器弹出
  }
}

async function onDeleteTemplate(): Promise<void> {
  const template = selectedTemplate.value
  if (!template || template.builtin) return
  const confirmed = await ElMessageBox.confirm(
    `删除模板「${template.name}」后不可恢复；已经套用过它的账本保留现有分类（只是不再跟这套模板同步）。`,
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

onMounted(async () => {
  // 默认选中当前账本用的那套模板
  const current = auth.books.find((b) => b.current) ?? auth.books[0] ?? null
  templateId.value = current?.categoryTemplateId ?? BUILTIN_ID
  await loadTemplates()
})
</script>

<template>
  <div class="cat-page">
    <div class="page-head">
      <h2 class="page-title">分类模板</h2>
    </div>

    <section class="tpl-card">
      <div class="tpl-row">
        <el-select :model-value="templateId" class="tpl-select" placeholder="选择模板" @change="onTemplateChange">
          <el-option
            v-for="t in templates"
            :key="t.id"
            :value="t.id"
            :label="t.builtin ? `${t.name}（内置）` : t.name"
          />
        </el-select>

        <el-button type="primary" @click="onCreateTemplate">新建模板</el-button>
        <el-button @click="onSaveAsTemplate">存为模板</el-button>
        <el-button :disabled="selectedIsBuiltin" @click="onRenameTemplate">重命名</el-button>
        <el-button type="danger" plain :disabled="selectedIsBuiltin" @click="onDeleteTemplate">
          删除模板
        </el-button>
      </div>
    </section>

    <section class="batch-bar">
      <el-checkbox
        :model-value="allSelected"
        :indeterminate="someSelected"
        :disabled="items.length === 0"
        @change="toggleAll"
      >
        全选
      </el-checkbox>
      <span class="batch-count">已选 {{ selectedKeys.length }} / {{ items.length }} 个</span>
      <el-button
        type="danger"
        plain
        size="small"
        :disabled="!selectedKeys.length || saving"
        @click="onBatchDelete"
      >
        删除所选
      </el-button>
      <span class="batch-spacer" />
      <span v-if="saving" class="tpl-dirty">保存中…</span>
    </section>

    <section v-for="group in GROUPS" :key="group.type" class="cat-card">
      <header class="cat-head">
        <div class="cat-head-left">
          <el-checkbox
            :model-value="groupAllSelected(group.type)"
            :indeterminate="groupSomeSelected(group.type)"
            :disabled="byType(group.type).length === 0"
            @change="(checked: boolean | string | number) => toggleGroup(group.type, checked)"
          >
            全选
          </el-checkbox>
          <h3 class="cat-title">{{ group.title }}</h3>
          <span class="cat-count">{{ byType(group.type).length }}</span>
        </div>
        <el-button
          size="small"
          type="primary"
          plain
          @click="openCreate(group.type)"
        >
          ＋ 新增{{ group.short }}
        </el-button>
      </header>

      <div class="cat-list">
        <p v-if="byType(group.type).length === 0" class="cat-empty">
          这套模板还没有{{ group.short }}分类。
        </p>

        <div v-for="item in byType(group.type)" :key="itemKey(item)" class="cat-row">
          <el-checkbox
            :model-value="selectedKeys.includes(itemKey(item))"
            class="row-check"
            @change="(checked: boolean | string | number) => toggleKey(itemKey(item), checked)"
          />
          <span class="cat-icon">{{ iconOf(item.icon) }}</span>
          <span class="cat-name">{{ item.name }}</span>
          <span class="cat-color" :style="{ background: colorOf(item.color) }" />
          <span class="cat-ops">
            <el-button text size="small" @click="openEdit(item)">编辑</el-button>
            <el-button
              text
              size="small"
              type="danger"
              @click="onDelete(item)"
            >
              删除
            </el-button>
          </span>
        </div>
      </div>
    </section>

    <CategoryFormDialog
      v-model="dialogVisible"
      :type="formType"
      :initial="formInitial"
      :title="editingItem ? '编辑分类' : undefined"
      :saving="saving"
      @submit="onItemSubmit"
    />

    <TemplateFormDialog
      v-model="templateDialogVisible"
      :template="null"
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
}

.tpl-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.tpl-select {
  width: 220px;
}

.tpl-dirty {
  font-size: 12px;
  color: var(--el-color-warning);
}

.batch-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 4px 0 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.batch-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.batch-spacer {
  flex: 1;
}

.cat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.cat-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cat-title {
  margin: 0;
  font-size: 14px;
}

.cat-count {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--el-fill-color);
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.cat-list {
  display: grid;
  gap: 4px;
  min-height: 40px;
}

.cat-empty {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.cat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
}

.cat-row:hover {
  background: var(--el-fill-color-lighter);
}

.row-check {
  flex: none;
}

.cat-icon {
  width: 22px;
  text-align: center;
}

.cat-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-color {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.cat-ops {
  flex: none;
  display: inline-flex;
}

@media (max-width: 767px) {
  .tpl-select {
    width: 100%;
  }
}
</style>