<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  archiveBook,
  createBook,
  deleteBook,
  deleteBooks,
  listBooks,
  listTrash,
  purgeBook,
  purgeBooks,
  restoreBook,
  switchBook,
  unarchiveBook,
  updateBook,
} from '../api/book'
import { listTemplates } from '../api/template'
import type { Book, BookTrash, CategoryTemplate } from '../types/api'
import { useAuthStore } from '../stores/auth'

/**
 * 账本页：新建 / 编辑 / 切换 / 归档 / 删除（回收站）/ 恢复。
 * 列表以 store 里的 books 为准（顶栏切换器、归档横幅也读它），回收站单独拉。
 * 切换 / 新建 / 删除都可能改变「当前账本」→ AppLayout 给 RouterView 换 key，本页会重新挂载并重拉。
 * <p>一个学期 = 一本账本：学期结束就「归档」，归档后只读（不能记流水、不能改分类），
 * 但仍可改名、改截止日期、导出、分享、取消归档。
 */

const auth = useAuthStore()

const books = computed(() => auth.books)

const tab = ref<'books' | 'trash'>('books')
const loading = ref(false)
const busy = ref(false)
const trash = ref<BookTrash[]>([])

/* ---------- 勾选与批量删除 ---------- */

const selectedBooks = ref<number[]>([])
const selectedTrash = ref<number[]>([])
const batchBusy = ref(false)

const allBooksSelected = computed(
  () => books.value.length > 0 && selectedBooks.value.length === books.value.length,
)
const someBooksSelected = computed(
  () => selectedBooks.value.length > 0 && selectedBooks.value.length < books.value.length,
)
const allTrashSelected = computed(
  () => trash.value.length > 0 && selectedTrash.value.length === trash.value.length,
)
const someTrashSelected = computed(
  () => selectedTrash.value.length > 0 && selectedTrash.value.length < trash.value.length,
)

function toggleAllBooks(value: boolean | string | number): void {
  selectedBooks.value = value ? books.value.map((b) => b.id) : []
}

function toggleAllTrash(value: boolean | string | number): void {
  selectedTrash.value = value ? trash.value.map((t) => t.id) : []
}

async function onBatchDeleteBooks(): Promise<void> {
  if (!selectedBooks.value.length || batchBusy.value) return
  const count = selectedBooks.value.length
  const confirmed = await ElMessageBox.confirm(
    `选中的 ${count} 本账本会移入回收站，15 天内可以恢复；到期后连同分类和流水彻底删除。`,
    '批量删除账本',
    { type: 'warning', confirmButtonText: '移入回收站', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  batchBusy.value = true
  try {
    auth.setBooks(await deleteBooks(selectedBooks.value))
    selectedBooks.value = []
    await load()
    ElMessage.success(`已把 ${count} 本账本移入回收站`)
  } catch {
    // 如「至少保留一本账本」——提示已由拦截器弹出
  } finally {
    batchBusy.value = false
  }
}

async function onBatchPurgeTrash(): Promise<void> {
  if (!selectedTrash.value.length || batchBusy.value) return
  const count = selectedTrash.value.length
  const confirmed = await ElMessageBox.confirm(
    h('div', [
      `选中的 ${count} 本账本会立刻连同全部分类与流水被彻底删除，`,
      h('span', { style: 'color: var(--el-color-danger); font-weight: 600' }, '无法恢复'),
      '。确定吗？',
    ]),
    '批量彻底删除',
    { type: 'error', confirmButtonText: '彻底删除', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  batchBusy.value = true
  try {
    const deleted = await purgeBooks(selectedTrash.value)
    selectedTrash.value = []
    await load()
    ElMessage.success(`已彻底删除 ${deleted} 本账本`)
  } catch {
    // 提示已由拦截器弹出
  } finally {
    batchBusy.value = false
  }
}

/* ---------- 新建账本（弹窗：起名 + 选分类模板 + 学期截止日期） ---------- */

/** 内置模板的虚拟 id（后端约定 0，不入库） */
const BUILTIN_ID = 0

const templates = ref<CategoryTemplate[]>([])
const createVisible = ref(false)
const newName = ref('')
const newTemplateId = ref<number>(BUILTIN_ID)
const newSemesterEnd = ref<string | null>(null)
const creating = ref(false)

const currentBook = computed(() => books.value.find((b) => b.current) ?? null)

function templateLabel(t: CategoryTemplate): string {
  return t.builtin ? `${t.name}（内置）` : t.name
}

/**
 * 默认选「当前账本正在用的那套」：多数人是给新学期再开一本、分类沿用；
 * 下拉里看得见选的是哪套，不会偷偷改变含义。
 */
function syncDefaultTemplate(): void {
  const preferred = currentBook.value?.categoryTemplateId ?? null
  // 老账本 categoryTemplateId 可能是 NULL（默认模板后来才落库）：这时选列表第一套，
  // 不要把 0 写进下拉——列表里没有 id=0 的选项，会显示成一个裸「0」
  newTemplateId.value =
    preferred !== null && templates.value.some((t) => t.id === preferred)
      ? preferred
      : templates.value[0]?.id ?? BUILTIN_ID
}

async function loadTemplates(): Promise<void> {
  try {
    templates.value = await listTemplates()
  } catch {
    // 拉不到模板不影响建账本：留空数组，后端收到省略的 templateId 就用内置
  }
  // 默认模板现在是一条真实模板（注册时建的），所以「不在列表里」时回落到列表第一套，
  // 而不是 id=0（只有模板被全删的历史账号才还会返回 id=0 的只读投影）
  if (!templates.value.some((t) => t.id === newTemplateId.value)) {
    newTemplateId.value = templates.value[0]?.id ?? BUILTIN_ID
  }
}

function openCreate(): void {
  syncDefaultTemplate()
  newName.value = ''
  newSemesterEnd.value = null
  createVisible.value = true
  void loadTemplates()
}

/* ---------- 编辑（改名 + 学期截止日期） ---------- */

const editVisible = ref(false)
const editingBook = ref<Book | null>(null)
const editName = ref('')
const editSemesterEnd = ref<string | null>(null)
const savingEdit = ref(false)

function openEdit(book: Book): void {
  editingBook.value = book
  editName.value = book.name
  editSemesterEnd.value = book.semesterEnd
  editVisible.value = true
}

async function load(): Promise<void> {
  loading.value = true
  try {
    auth.setBooks(await listBooks())
    trash.value = await listTrash()
    syncDefaultTemplate()
  } catch {
    // 401 已由拦截器跳登录页，其余错误已弹提示
  } finally {
    loading.value = false
  }
}

/** 只用于展示「还剩几天」；是否该清理由后端判断，客户端时钟不可信 */
function daysLeft(expireAt: string): number {
  const remain = new Date(expireAt.replace(' ', 'T')).getTime() - Date.now()
  return Math.max(0, Math.ceil(remain / 86_400_000))
}

async function onCreate(): Promise<void> {
  const name = newName.value.trim()
  if (!name) {
    ElMessage.warning('先给新账本起个名字')
    return
  }
  if (creating.value) return
  creating.value = true
  try {
    const book = await createBook({
      name,
      templateId: newTemplateId.value,
      semesterEnd: newSemesterEnd.value || null,
    })
    newName.value = ''
    newSemesterEnd.value = null
    createVisible.value = false
    // 必须刷新 store：layout 的 key 取自 store 里的 current 账本，只调接口不更新 store 的话
    // 页面不会重挂，看起来就是「新建了但没切过去，刷新一下才对」
    await load()
    ElMessage.success(`已新建「${book.name}」并切换过去`)
  } catch {
    // 提示已由拦截器弹出（如「账本最多 10 本」），弹窗保持打开
  } finally {
    creating.value = false
  }
}

async function onSaveEdit(): Promise<void> {
  const book = editingBook.value
  const name = editName.value.trim()
  if (!book) return
  if (!name) {
    ElMessage.warning('账本名不能为空')
    return
  }
  if (savingEdit.value) return
  savingEdit.value = true
  try {
    auth.applyBook(
      await updateBook(book.id, { name, semesterEnd: editSemesterEnd.value || null }),
    )
    editVisible.value = false
    ElMessage.success('已保存')
  } catch {
    // 提示已由拦截器弹出
  } finally {
    savingEdit.value = false
  }
}

async function onSwitch(book: Book): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    auth.setBooks(await switchBook(book.id))
    ElMessage.success(`已切换到「${book.name}」`)
  } catch {
    // 同上
  } finally {
    busy.value = false
  }
}

async function onArchive(book: Book): Promise<void> {
  const confirmed = await ElMessageBox.confirm(
    `「${book.name}」归档后会变成只读：不能再记流水、不能改分类，` +
      '但仍可查看、统计、导出、分享，也可以随时取消归档。',
    '归档账本（学期结束）',
    { type: 'warning', confirmButtonText: '归档', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  if (busy.value) return
  busy.value = true
  try {
    auth.applyBook(await archiveBook(book.id))
    ElMessage.success(`「${book.name}」已归档，现在是只读`)
  } catch {
    // 同上
  } finally {
    busy.value = false
  }
}

async function onUnarchive(book: Book): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    auth.applyBook(await unarchiveBook(book.id))
    ElMessage.success(`「${book.name}」已取消归档，可以继续记账了`)
  } catch {
    // 同上
  } finally {
    busy.value = false
  }
}

async function onDelete(book: Book): Promise<void> {
  const confirmed = await ElMessageBox.confirm(
    `「${book.name}」会移入回收站，15 天内可以恢复；到期后连同分类和流水彻底删除。`,
    '删除账本',
    { type: 'warning', confirmButtonText: '移入回收站', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  if (busy.value) return
  busy.value = true
  try {
    await deleteBook(book.id)
    await load()
    ElMessage.success('已移入回收站')
  } catch {
    // 如「至少保留一本账本」
  } finally {
    busy.value = false
  }
}

async function onRestore(item: BookTrash): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await restoreBook(item.id)
    await load()
    ElMessage.success(`「${item.name}」已恢复`)
  } catch {
    // 同上
  } finally {
    busy.value = false
  }
}

/** 立即彻底删除：不可恢复，所以文案要把后果说全，并再确认一次 */
async function onPurge(item: BookTrash): Promise<void> {
  if (busy.value) return
  const confirmed = await ElMessageBox.confirm(
    // 用 VNode 而不是字符串：ElMessageBox 不解析 markdown，字符串里的 ** 会原样显示；
    // 也不能用 dangerouslyUseHTMLString —— 账本名是用户输入，拼 HTML 等于开 XSS
    h('div', [
      `「${item.name}」会立刻连同全部分类与流水被彻底删除，`,
      h(
        'span',
        { style: 'color: var(--el-color-danger); font-weight: 600' },
        '无法恢复',
      ),
      '（不用等到 15 天后）。确定吗？',
    ]),
    '彻底删除账本',
    { type: 'error', confirmButtonText: '彻底删除', cancelButtonText: '取消' },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  busy.value = true
  try {
    await purgeBook(item.id)
    await load()
    ElMessage.success(`「${item.name}」已彻底删除`)
  } catch {
    // 同上
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void load()
  void loadTemplates()
})
</script>

<template>
  <div class="books-page">
    <div class="page-head">
      <h2 class="page-title">账本</h2>
    </div>

    <el-tabs v-model="tab">
      <el-tab-pane label="我的账本" name="books">
        <div class="create-row">
          <el-button type="primary" @click="openCreate">＋ 新增账本</el-button>
        </div>

        <div class="batch-bar">
          <el-checkbox
            :model-value="allBooksSelected"
            :indeterminate="someBooksSelected"
            :disabled="books.length === 0"
            @change="toggleAllBooks"
          >
            全选
          </el-checkbox>
          <span class="batch-count">已选 {{ selectedBooks.length }} / {{ books.length }} 本</span>
          <el-button
            type="danger"
            plain
            size="small"
            :disabled="!selectedBooks.length"
            :loading="batchBusy"
            @click="onBatchDeleteBooks"
          >
            删除所选
          </el-button>
        </div>

        <div v-loading="loading" class="book-list">
          <el-empty v-if="!loading && books.length === 0" description="还没有账本" />

          <div v-for="book in books" :key="book.id" class="book-row">
            <el-checkbox v-model="selectedBooks" :value="book.id" class="row-check" />
            <span class="book-name">{{ book.name }}</span>
            <el-tag v-if="book.current" size="small" type="success">当前</el-tag>
            <el-tag v-if="book.archived" size="small" type="info">已归档</el-tag>
            <span v-if="book.semesterEnd" class="book-meta">截止 {{ book.semesterEnd }}</span>
            <span class="book-actions">
              <el-button v-if="!book.current" text size="small" @click="onSwitch(book)">切换</el-button>
              <el-button text size="small" @click="openEdit(book)">编辑</el-button>
              <el-button v-if="!book.archived" text size="small" @click="onArchive(book)">
                归档
              </el-button>
              <el-button v-else text size="small" type="primary" @click="onUnarchive(book)">
                取消归档
              </el-button>
              <el-button
                text
                size="small"
                type="danger"
                :disabled="books.length === 1"
                @click="onDelete(book)"
              >
                删除
              </el-button>
            </span>
          </div>
        </div>

        <p class="hint">
          删除会进回收站，15 天内可以恢复；至少保留一本账本。
          归档的账本是只读的（学期结束），随时可以取消归档。
        </p>
      </el-tab-pane>

      <el-tab-pane label="回收站" name="trash">
        <div class="batch-bar">
          <el-checkbox
            :model-value="allTrashSelected"
            :indeterminate="someTrashSelected"
            :disabled="trash.length === 0"
            @change="toggleAllTrash"
          >
            全选
          </el-checkbox>
          <span class="batch-count">已选 {{ selectedTrash.length }} / {{ trash.length }} 本</span>
          <el-button
            type="danger"
            plain
            size="small"
            :disabled="!selectedTrash.length"
            :loading="batchBusy"
            @click="onBatchPurgeTrash"
          >
            彻底删除所选
          </el-button>
        </div>

        <div v-loading="loading" class="book-list">
          <el-empty v-if="!loading && trash.length === 0" description="回收站是空的" />

          <div v-for="item in trash" :key="item.id" class="book-row">
            <el-checkbox v-model="selectedTrash" :value="item.id" class="row-check" />
            <span class="book-name">{{ item.name }}</span>
            <span class="trash-meta">
              {{ item.deletedAt.slice(0, 10) }} 删除 · 还剩 {{ daysLeft(item.expireAt) }} 天
            </span>
            <el-button text size="small" type="primary" @click="onRestore(item)">恢复</el-button>
            <el-button text size="small" type="danger" @click="onPurge(item)">彻底删除</el-button>
          </div>
        </div>

        <p class="hint">
          到期后账本连同它的分类与流水会被彻底删除，无法恢复。想保留就现在恢复。
        </p>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="createVisible" title="新增账本" width="min(440px, 92vw)">
      <el-form label-position="top" @submit.prevent="onCreate">
        <el-form-item label="账本名">
          <el-input
            v-model="newName"
            maxlength="50"
            show-word-limit
            placeholder="如：2026-2027 秋季"
            @keydown.enter.prevent="onCreate"
          />
        </el-form-item>

        <el-form-item label="分类模板">
          <el-select v-model="newTemplateId" style="width: 100%" placeholder="选择分类模板">
            <el-option
              v-for="t in templates"
              :key="t.id"
              :value="t.id"
              :label="templateLabel(t)"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="学期截止日期（可选）">
          <el-date-picker
            v-model="newSemesterEnd"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="如：2027-01-15"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>

      <p class="dialog-tip">
        新账本直接按这套模板预置分类；学期结束可以在账本页把它「归档」成只读，换届数据就不会被误改。
      </p>

      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="onCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑账本" width="min(440px, 92vw)">
      <el-form label-position="top" @submit.prevent="onSaveEdit">
        <el-form-item label="账本名">
          <el-input
            v-model="editName"
            maxlength="50"
            show-word-limit
            @keydown.enter.prevent="onSaveEdit"
          />
        </el-form-item>

        <el-form-item label="学期截止日期（可选）">
          <el-date-picker
            v-model="editSemesterEnd"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="如：2027-01-15"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>

      <p v-if="editingBook?.archived" class="dialog-tip">
        这本账本已归档，只能改名字和截止日期；要补记流水请先「取消归档」。
      </p>

      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingEdit" @click="onSaveEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-head {
  margin-bottom: 8px;
}

.page-title {
  margin: 0;
  font-size: 18px;
}

.create-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.dialog-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.batch-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 10px;
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

.book-list {
  min-height: 120px;
  display: grid;
  gap: 6px;
}

.book-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}

.book-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.book-meta {
  flex: none;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.book-actions {
  display: flex;
  flex: none;
}

.trash-meta {
  flex: none;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.hint {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

@media (max-width: 767px) {
  .trash-meta,
  .book-meta {
    display: none;
  }
}
</style>