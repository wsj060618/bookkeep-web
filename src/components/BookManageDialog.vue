<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createBook,
  deleteBook,
  listBooks,
  listTrash,
  renameBook,
  restoreBook,
  switchBook,
} from '../api/book'
import type { Book, BookTrash } from '../types/api'
import { useAuthStore } from '../stores/auth'

/**
 * 账本管理：新建 / 改名 / 切换 / 删除（回收站）/ 恢复。
 * 列表以 store 里的 books 为准（顶栏切换器也读它），回收站单独拉。
 * 切换、新建、删除都会改变「当前账本」，必须通知父页面重新拉分类 / 流水 / 统计。
 */

const props = defineProps<{ modelValue: boolean }>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** 当前账本可能变了，父页面要重新加载数据 */
  changed: []
}>()

const auth = useAuthStore()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const books = computed(() => auth.books)

const tab = ref<'books' | 'trash'>('books')
const loading = ref(false)
const busy = ref(false)
const trash = ref<BookTrash[]>([])

const newName = ref('')
const renamingId = ref<number | null>(null)
const renameValue = ref('')

async function load(): Promise<void> {
  loading.value = true
  try {
    auth.setBooks(await listBooks())
    trash.value = await listTrash()
  } catch {
    // 401 已由拦截器跳登录页，其余错误已弹提示
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    tab.value = 'books'
    newName.value = ''
    renamingId.value = null
    void load()
  },
)

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
  if (busy.value) return
  busy.value = true
  try {
    const book = await createBook({ name })
    newName.value = ''
    await load()
    ElMessage.success(`已新建「${book.name}」并切换过去`)
    // 新建即切换：分类也换了一套，父页面必须重载
    emit('changed')
  } catch {
    // 提示已由拦截器弹出（如「账本最多 10 本」）
  } finally {
    busy.value = false
  }
}

async function onSwitch(book: Book): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    auth.setBooks(await switchBook(book.id))
    ElMessage.success(`已切换到「${book.name}」`)
    emit('changed')
  } catch {
    // 同上
  } finally {
    busy.value = false
  }
}

function startRename(book: Book): void {
  renamingId.value = book.id
  renameValue.value = book.name
}

async function confirmRename(book: Book): Promise<void> {
  const name = renameValue.value.trim()
  if (!name) {
    ElMessage.warning('账本名不能为空')
    return
  }
  if (busy.value) return
  busy.value = true
  try {
    auth.applyBook(await renameBook(book.id, { name }))
    renamingId.value = null
    ElMessage.success('账本名已更新')
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
    // 删的可能就是当前账本（后端会自动重指），数据必须重载
    emit('changed')
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
</script>

<template>
  <el-dialog v-model="visible" title="账本管理" width="min(560px, 94vw)">
    <el-tabs v-model="tab">
      <el-tab-pane label="我的账本" name="books">
        <div class="create-row">
          <el-input
            v-model="newName"
            maxlength="50"
            placeholder="新账本名，如：二班班费"
            @keyup.enter="onCreate"
          />
          <el-button type="primary" :loading="busy" @click="onCreate">新建</el-button>
        </div>

        <div v-loading="loading" class="book-list">
          <el-empty v-if="!loading && books.length === 0" description="还没有账本" />

          <div v-for="book in books" :key="book.id" class="book-row">
            <template v-if="renamingId === book.id">
              <el-input
                v-model="renameValue"
                class="rename-input"
                maxlength="50"
                @keyup.enter="confirmRename(book)"
              />
              <el-button size="small" type="primary" @click="confirmRename(book)">保存</el-button>
              <el-button size="small" @click="renamingId = null">取消</el-button>
            </template>

            <template v-else>
              <span class="book-name">{{ book.name }}</span>
              <el-tag v-if="book.current" size="small" type="success">当前</el-tag>
              <span class="book-actions">
                <el-button v-if="!book.current" text size="small" @click="onSwitch(book)">切换</el-button>
                <el-button text size="small" @click="startRename(book)">改名</el-button>
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
            </template>
          </div>
        </div>

        <p class="hint">
          删除会进回收站，15 天内可以恢复；至少保留一本账本。新建账本会自动预置 13 个分类。
        </p>
      </el-tab-pane>

      <el-tab-pane label="回收站" name="trash">
        <div v-loading="loading" class="book-list">
          <el-empty v-if="!loading && trash.length === 0" description="回收站是空的" />

          <div v-for="item in trash" :key="item.id" class="book-row">
            <span class="book-name">{{ item.name }}</span>
            <span class="trash-meta">
              {{ item.deletedAt.slice(0, 10) }} 删除 · 还剩 {{ daysLeft(item.expireAt) }} 天
            </span>
            <el-button text size="small" type="primary" @click="onRestore(item)">恢复</el-button>
          </div>
        </div>

        <p class="hint">
          到期后账本连同它的分类与流水会被彻底删除，无法恢复。想保留就现在恢复。
        </p>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<style scoped>
.create-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.book-list {
  min-height: 80px;
  display: grid;
  gap: 6px;
}

.book-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
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

.rename-input {
  flex: 1;
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
</style>