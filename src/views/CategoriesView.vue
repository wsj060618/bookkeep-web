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
import { useAuthStore } from '../stores/auth'
import { colorOf, iconOf } from '../utils/category'
import type { CategoryTemplate, TemplateItemInput, TxType } from '../types/api'

/**
 * 分类模板管理页（账号级，**与当前账本的分类无关**）。
 *
 * <p>页面下半部分那两张「支出 / 收入」卡片，展示并编辑的就是**所选模板**的条目：
 * 改完是本地草稿，点「保存模板」才提交（`PUT /api/category-templates/{id}` 整体替换条目）。
 * 模板只在**新建账本**时被复制成那一本的分类；之后再改模板不会改动已有账本。
 *
 * <p>内置「班级班费」（id=0）只读：想改先「存为模板」复制一份。
 */

const auth = useAuthStore()

const GROUPS: { type: TxType; title: string; short: string }[] = [
  { type: 'expense', title: '支出分类', short: '支出' },
  { type: 'income', title: '收入分类', short: '收入' },
]

/** 内置模板的虚拟 id（后端约定 0，不入库） */
const BUILTIN_ID = 0

const templates = ref<CategoryTemplate[]>([])
const templateId = ref<number>(BUILTIN_ID)
const templateDialogVisible = ref(false)
const savingTemplate = ref(false)

const selectedTemplate = computed(
  () => templates.value.find((t) => t.id === templateId.value) ?? templates.value[0] ?? null,
)
const selectedIsBuiltin = computed(() => selectedTemplate.value?.builtin ?? true)

/* ---------- 草稿：从所选模板同步，改动只在本地 ---------- */

const draftItems = ref<TemplateItemInput[]>([])
const saving = ref(false)

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

/** 有改动才允许保存（比名称与方向的序列，够用且不用深比较） */
const dirty = computed(() => {
  const template = selectedTemplate.value
  if (!template) return false
  const before = template.items.map((item) => `${item.type}:${item.name}:${item.icon}:${item.color}`)
  const after = draftItems.value.map((item) => `${item.type}:${item.name}:${item.icon}:${item.color}`)
  return before.length !== after.length || before.some((value, index) => value !== after[index])
})

/** 切模板 / 保存完：把草稿对齐到选中模板 */
const lastTemplateId = ref<number>(BUILTIN_ID)
watch(
  () => selectedTemplate.value?.id,
  (id) => {
    lastTemplateId.value = id ?? BUILTIN_ID
    syncDraft()
    selectedKeys.value = []
  },
  { immediate: true },
)

async function onTemplateChange(): Promise<void> {
  if (!dirty.value) {
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
    templateId.value = lastTemplateId.value
  }
}

/* ---------- 条目增删改（全部落在草稿上） ---------- */

function itemKey(item: TemplateItemInput): string {
  return `${item.type}|${item.name}`
}

function byType(type: TxType): TemplateItemInput[] {
  return draftItems.value.filter((item) => item.type === type)
}

const dialogVisible = ref(false)
const editingItem = ref<TemplateItemInput | null>(null)
const formType = ref<TxType>('expense')
const formInitial = ref<{ name: string; icon: string | null; color: string | null } | null>(null)

function guardBuiltin(): boolean {
  if (selectedIsBuiltin.value) {
    ElMessage.warning('内置模板不能改；先「存为模板」复制一份再编辑')
    return false
  }
  return true
}

function openCreate(type: TxType): void {
  if (!guardBuiltin()) return
  editingItem.value = null
  formType.value = type
  formInitial.value = null
  dialogVisible.value = true
}

function openEdit(item: TemplateItemInput): void {
  if (!guardBuiltin()) return
  editingItem.value = item
  formType.value = item.type
  formInitial.value = { name: item.name, icon: item.icon, color: item.color }
  dialogVisible.value = true
}

/** 弹窗提交：新增或改某一条（含图标/颜色），仍然只改草稿 */
function onItemSubmit(payload: { name: string; type: TxType; icon: string; color: string }): void {
  const duplicate = draftItems.value.some(
    (item) =>
      item.type === payload.type &&
      item.name === payload.name &&
      item !== editingItem.value,
  )
  if (duplicate) {
    ElMessage.warning('这套模板里已有同名分类')
    return
  }
  if (editingItem.value) {
    editingItem.value.name = payload.name
    editingItem.value.icon = payload.icon
    editingItem.value.color = payload.color
  } else {
    draftItems.value.push({
      name: payload.name,
      type: payload.type,
      icon: payload.icon,
      color: payload.color,
    })
  }
  dialogVisible.value = false
}

async function onDelete(item: TemplateItemInput): Promise<void> {
  if (!guardBuiltin()) return
  const confirmed = await ElMessageBox.confirm(
    `从模板里删掉「${item.name}」？（只改模板，不影响已有账本）`,
    '删除分类',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  draftItems.value = draftItems.value.filter((other) => other !== item)
}

/* ---------- 勾选与批量删除（同样是草稿） ---------- */

const selectedKeys = ref<string[]>([])

const allSelected = computed(
  () => draftItems.value.length > 0 && selectedKeys.value.length === draftItems.value.length,
)
const someSelected = computed(
  () => selectedKeys.value.length > 0 && selectedKeys.value.length < draftItems.value.length,
)

function toggleAll(checked: boolean | string | number): void {
  selectedKeys.value = checked ? draftItems.value.map(itemKey) : []
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
  if (!guardBuiltin()) return
  if (!selectedKeys.value.length) return
  const count = selectedKeys.value.length
  const confirmed = await ElMessageBox.confirm(
    `从模板里删除选中的 ${count} 个分类？（只改模板，不影响已有账本）`,
    '批量删除分类',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  const keys = new Set(selectedKeys.value)
  draftItems.value = draftItems.value.filter((item) => !keys.has(itemKey(item)))
  selectedKeys.value = []
}

/* ---------- 保存 ---------- */

async function onSave(): Promise<void> {
  const template = selectedTemplate.value
  if (!template || template.builtin || saving.value || !dirty.value) return
  if (draftItems.value.length === 0) {
    ElMessage.warning('模板至少保留一个分类')
    return
  }
  saving.value = true
  try {
    const saved = await updateTemplate(template.id, template.name, draftItems.value)
    await loadTemplates()
    templateId.value = saved.id
    syncDraft()
    ElMessage.success(`已保存「${saved.name}」`)
  } catch {
    // 校验失败等 400 已由拦截器提示
  } finally {
    saving.value = false
  }
}

/* ---------- 模板本身：新建 / 存为 / 重命名 / 删除 ---------- */

async function loadTemplates(): Promise<void> {
  try {
    templates.value = await listTemplates()
  } catch {
    return
  }
  // 模板被删掉后可能留着旧 id：不在列表里就回落到内置
  if (!templates.value.some((t) => t.id === templateId.value)) {
    templateId.value = BUILTIN_ID
  }
}

/** 删模板会把引用它的账本指回内置，所以 books 也要重拉 */
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

onMounted(async () => {
  // 默认选中「当前账本当初用的那套模板」，方便从常见的那套开始看
  const current = auth.books.find((b) => b.current) ?? auth.books[0] ?? null
  templateId.value = current?.categoryTemplateId ?? BUILTIN_ID
  await loadTemplates()
})
</script>

<template>
  <div class="cat-page">
    <div class="page-head">
      <h2 class="page-title">分类模板</h2>
      <p class="page-desc">
        这一页管理的是<b>账号级的分类模板</b>：下面两张卡片就是所选模板的内容，改完点「保存模板」生效。
        模板在<b>新建账本</b>时复制成那本账本的分类；已经有数据的账本不受模板改动影响。
      </p>
    </div>

    <section class="tpl-card">
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
        <el-button :disabled="selectedIsBuiltin" @click="onRenameTemplate">重命名</el-button>
        <el-button type="danger" plain :disabled="selectedIsBuiltin" @click="onDeleteTemplate">
          删除模板
        </el-button>
      </div>

      <p class="tpl-tip">
        内置模板只读；想改就先「存为模板」复制一份。切换模板时若有未保存的改动会提示你确认。
      </p>
    </section>

    <section class="batch-bar">
      <el-checkbox
        :model-value="allSelected"
        :indeterminate="someSelected"
        :disabled="selectedIsBuiltin || draftItems.length === 0"
        @change="toggleAll"
      >
        全选
      </el-checkbox>
      <span class="batch-count">已选 {{ selectedKeys.length }} / {{ draftItems.length }} 个</span>
      <el-button
        type="danger"
        plain
        size="small"
        :disabled="selectedIsBuiltin || !selectedKeys.length"
        @click="onBatchDelete"
      >
        删除所选
      </el-button>
      <span class="batch-spacer" />
      <span v-if="dirty" class="tpl-dirty">有未保存的改动</span>
      <el-button
        type="primary"
        size="small"
        :disabled="selectedIsBuiltin || !dirty"
        :loading="saving"
        @click="onSave"
      >
        保存模板
      </el-button>
    </section>

    <section v-for="group in GROUPS" :key="group.type" class="cat-card">
      <header class="cat-head">
        <div class="cat-head-left">
          <el-checkbox
            :model-value="groupAllSelected(group.type)"
            :indeterminate="groupSomeSelected(group.type)"
            :disabled="selectedIsBuiltin || byType(group.type).length === 0"
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
          :disabled="selectedIsBuiltin"
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
            v-model="selectedKeys"
            :value="itemKey(item)"
            class="row-check"
            :disabled="selectedIsBuiltin"
          />
          <span class="cat-icon">{{ iconOf(item.icon) }}</span>
          <span class="cat-name">{{ item.name }}</span>
          <span class="cat-color" :style="{ background: colorOf(item.color) }" />
          <span class="cat-ops">
            <el-button text size="small" :disabled="selectedIsBuiltin" @click="openEdit(item)">编辑</el-button>
            <el-button
              text
              size="small"
              type="danger"
              :disabled="selectedIsBuiltin"
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
      :saving="false"
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

.tpl-tip {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
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