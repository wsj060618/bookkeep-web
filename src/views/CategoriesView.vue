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
 * 改完是本地草稿，点「保存模板」才提交（`PUT /api/category-templates/{id}`）。
 * **保存时会同步到用过这套模板的账本**（见后端 `CategoryTemplateSyncService`）：
 * 新增补分类、改名改分类（流水跟着走）、删除要求该分类没有流水。
 *
 * <p>「班级班费」是**注册时自动建好的真实模板**，和其他模板一样能改名、增删条目、删除。
 * `id=0` 的只读投影只在「账号一套模板都没有」时兜底，正常用不到。
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
/**
 * 勾选状态：**必须声明在下面那个 immediate watcher 之前**，
 * 否则 watcher 在 setup 里同步执行时会触发 TDZ（Cannot access 'selectedKeys' before initialization），
 * 整个页面 setup 抛错——表现出来就是「页面状态不对/提示乱跳」。
 */
const selectedKeys = ref<string[]>([])

function syncDraft(): void {
  const template = selectedTemplate.value
  draftItems.value = template
    ? template.items.map((item) => ({
        // id 要一路带到保存：后端靠它区分「改名」和「删旧建新」
        id: item.id,
        name: item.name,
        type: item.type,
        icon: item.icon,
        color: item.color,
      }))
    : []
}

/**
 * 有改动才允许保存。
 * <p>比较时**必须归一化**：后端可能返回 null / 缺字段 / 空字符串，顺序也可能因为
 * sortOrder 与插入顺序不同而错位——之前直接拼字符串比较，导致「什么都没改也提示有改动」。
 * 这里统一：type + 去空格的名称 + icon/color 缺省为空串，并按同样顺序做多重集比较。
 */
function signature(item: TemplateItemInput): string {
  return [
    item.type,
    (item.name ?? '').trim(),
    (item.icon ?? '').trim(),
    (item.color ?? '').trim(),
  ].join('|')
}

const dirty = computed(() => {
  const template = selectedTemplate.value
  if (!template) return false
  const before = template.items.map(signature).sort()
  const after = draftItems.value.map(signature).sort()
  return before.length !== after.length || before.some((value, index) => value !== after[index])
})

/** 选中模板变了（含首次加载）→ 草稿重新对齐；这是唯一的数据来源，避免草稿残留上一套模板 */
watch(
  () => selectedTemplate.value?.id,
  () => {
    syncDraft()
    selectedKeys.value = []
  },
  { immediate: true },
)

/**
 * 切换模板。**下拉用 `:model-value` 单向绑定**（不是 v-model），由这里决定到底要不要切：
 * 有未保存改动时先确认，选「继续编辑」就**真的不切**（不写 templateId，下拉自动回到原值）。
 * <p>之前用 v-model + watch，选完确认框时模型已经改掉了，「继续编辑」反而什么都没拦住。
 */
async function onTemplateChange(next: number): Promise<void> {
  if (next === templateId.value) return
  if (dirty.value) {
    const discard = await ElMessageBox.confirm(
      '当前模板还有没保存的改动，切换后这些改动会丢失。',
      '放弃改动？',
      { type: 'warning', confirmButtonText: '放弃并切换', cancelButtonText: '继续编辑' },
    )
      .then(() => true)
      .catch(() => false)
    if (!discard) return
  }
  templateId.value = next
  syncDraft()
  selectedKeys.value = []
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

/**
 * 兜底：只有「账号里一套模板都没有」时，后端才返回 id=0 的只读投影（内容还是那 11 条）。
 * 正常账号（含历史账号，见 DefaultTemplateInitializer）都有真实模板，走不到这里。
 * <p>保留复制路径是为了让空模板账号点「编辑」时能一键复制成自己的模板，而不是卡住。
 */
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
    // 复制出来的是**新模板**，条目 id 必须去掉：带过去会被后端当成「改原来那套模板的条目」
    const clone = await createTemplate(
      name,
      draftItems.value.map(({ id: _id, ...rest }) => rest),
    );
    await loadTemplates()
    templateId.value = clone.id
    syncDraft()
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
  if (!(await ensureEditableTemplate())) return
  const confirmed = await ElMessageBox.confirm(
    `从模板里删掉「${item.name}」？保存后会同步删掉账本里的同名分类（已有流水的会被拦下）。`,
    '删除分类',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  draftItems.value = draftItems.value.filter((other) => other !== item)
}

/* ---------- 勾选与批量删除（同样是草稿） ---------- */

const allSelected = computed(
  () => draftItems.value.length > 0 && selectedKeys.value.length === draftItems.value.length,
)
const someSelected = computed(
  () => selectedKeys.value.length > 0 && selectedKeys.value.length < draftItems.value.length,
)

function toggleAll(checked: boolean | string | number): void {
  selectedKeys.value = checked ? draftItems.value.map(itemKey) : []
}

/** 单行勾选：selectedKeys 是普通数组，用 includes 驱动复选框（不是 el-checkbox-group） */
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
    `从模板里删除选中的 ${count} 个分类？保存后会同步删掉账本里的对应分类（已有流水的会被拦下）。`,
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

/** 模板列表变更后（例如别处改名/删模板），若本地没有未保存改动就把草稿对齐到最新 */
async function loadTemplates(): Promise<void> {
  try {
    templates.value = await listTemplates()
  } catch {
    return
  }
  // 选中项必须是列表里真实存在的一项：
  // 老账本的 book.category_template_id 可能还是 NULL（默认模板是后来才落库的），
  // onMounted 会把 NULL 当成 id=0，而下拉里已经没有 id=0 的选项——原来会直接显示一个裸「0」。
  if (!templates.value.some((t) => t.id === templateId.value)) {
    templateId.value = templates.value[0]?.id ?? BUILTIN_ID
  }
  if (!dirty.value) {
    syncDraft()
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
        <b>保存会把改动同步到用过这套模板的账本</b>（新增补分类、改名改分类、删除要求该分类没有流水）；
        模板只在<b>新建账本</b>时另有复制。
      </p>
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

      <p class="tpl-tip">
        「班级班费」是注册时自动给你建好的模板，和自建模板一样可以改名、增删条目、删除。
        <b>保存模板会同步到用过这套模板的账本</b>：新增的会补进账本，改名会跟着改，
        删掉的分类若已经有流水会被拦下来（先改流水再删）。
        切换模板时若有未保存的改动会提示你确认。
      </p>
    </section>

    <section class="batch-bar">
      <el-checkbox
        :model-value="allSelected"
        :indeterminate="someSelected"
        :disabled="draftItems.length === 0"
        @change="toggleAll"
      >
        全选
      </el-checkbox>
      <span class="batch-count">已选 {{ selectedKeys.length }} / {{ draftItems.length }} 个</span>
      <el-button
        type="danger"
        plain
        size="small"
        :disabled="!selectedKeys.length"
        @click="onBatchDelete"
      >
        删除所选
      </el-button>
      <span class="batch-spacer" />
      <span v-if="dirty" class="tpl-dirty">有未保存的改动</span>
      <el-button
        type="primary"
        size="small"
        :disabled="!dirty"
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