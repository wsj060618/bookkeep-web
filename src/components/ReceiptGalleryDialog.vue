<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  deleteReceipt,
  exportTransactionReceipts,
  fetchReceiptBlob,
  listReceipts,
  renameReceipt,
  uploadReceipt,
} from '../api/receipt'
import { saveBlob } from '../api/request'
import { RECEIPT_ACCEPT, RECEIPT_MAX_PER_TRANSACTION, defaultReceiptTitle, formatSize, validateReceiptFile } from '../utils/receipt'
import type { Receipt, Transaction } from '../types/api'

/**
 * 一笔流水的票据图集：看缩略图、改标题、删除、再加几张、只导出这一笔。
 * <p>登录态接口不能用 `<img src>` 直链（浏览器不会带 Authorization），
 * 所以每张图先取 Blob 再转 objectURL；关弹窗时统一 revoke，避免内存泄漏。
 */
const props = defineProps<{
  modelValue: boolean
  /** null = 没选中任何流水 */
  transaction: Transaction | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** 票据增删改后通知父组件刷新列表（徽标数字要变） */
  changed: []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const loading = ref(false)
const uploading = ref(false)
const receipts = ref<Receipt[]>([])
const titles = reactive<Record<number, string>>({})
/** receiptId → objectURL */
const previews = reactive<Record<number, string>>({})

function revokeAll(): void {
  Object.values(previews).forEach((url) => URL.revokeObjectURL(url))
  Object.keys(previews).forEach((key) => delete previews[Number(key)])
}

function clearState(): void {
  revokeAll()
  receipts.value = []
  Object.keys(titles).forEach((key) => delete titles[Number(key)])
}

async function load(): Promise<void> {
  const tx = props.transaction
  if (!tx) return
  loading.value = true
  clearState()
  try {
    receipts.value = await listReceipts(tx.id)
    receipts.value.forEach((r) => {
      titles[r.id] = r.title
    })
    // 逐张取图：失败的那张就留空白，不影响其他张
    await Promise.all(
      receipts.value.map(async (r) => {
        try {
          const blob = await fetchReceiptBlob(tx.id, r.id)
          previews[r.id] = URL.createObjectURL(blob)
        } catch {
          // 拦截器已经提示过，这里保持占位
        }
      }),
    )
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void load()
    else clearState()
  },
)

onBeforeUnmount(revokeAll)

const previewList = computed(() => receipts.value.map((r) => previews[r.id]).filter(Boolean) as string[])

async function saveTitle(receipt: Receipt): Promise<void> {
  const tx = props.transaction
  const next = (titles[receipt.id] ?? '').trim()
  if (!tx || !next || next === receipt.title) {
    titles[receipt.id] = receipt.title
    return
  }
  if (next.length > 30) {
    ElMessage.warning('票据标题不能超过 30 个字')
    titles[receipt.id] = receipt.title
    return
  }
  try {
    await renameReceipt(tx.id, receipt.id, next)
    receipt.title = next
    ElMessage.success('已改名')
    emit('changed')
  } catch {
    titles[receipt.id] = receipt.title
  }
}

async function remove(receipt: Receipt): Promise<void> {
  const tx = props.transaction
  if (!tx) return
  const ok = await ElMessageBox.confirm(`确定删除「${receipt.title}」？文件会一起删掉。`, '删除票据', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  }).catch(() => false)
  if (!ok) return
  try {
    await deleteReceipt(tx.id, receipt.id)
    const url = previews[receipt.id]
    if (url) URL.revokeObjectURL(url)
    delete previews[receipt.id]
    receipts.value = receipts.value.filter((r) => r.id !== receipt.id)
    ElMessage.success('已删除')
    emit('changed')
  } catch {
    // 拦截器已提示
  }
}

/** 选图：前端先按 MIME + 大小拦一遍，真正的判断（魔数）在后端 */
async function onPick(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = '' // 允许连续选同一个文件
  const tx = props.transaction
  if (!tx || files.length === 0) return

  uploading.value = true
  try {
    for (const file of files) {
      const error = validateReceiptFile(file, receipts.value.length)
      if (error) {
        ElMessage.warning(error)
        continue
      }
      try {
        await uploadReceipt(tx.id, file, defaultReceiptTitle(file.name))
        ElMessage.success(`已添加「${defaultReceiptTitle(file.name)}」`)
      } catch {
        // 拦截器已提示（如后端判定不是图片）
      }
    }
    await load()
    emit('changed')
  } finally {
    uploading.value = false
  }
}

async function exportSingle(): Promise<void> {
  const tx = props.transaction
  if (!tx) return
  try {
    const file = await exportTransactionReceipts(tx.id)
    saveBlob(file.blob, file.filename)
  } catch {
    // 拦截器已提示（没有票据时是 400 + 文案）
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="票据" width="min(560px, 94vw)" destroy-on-close>
    <div class="gallery-head">
      <span class="gallery-tip">
        {{ transaction?.categoryName }} · {{ transaction?.transDate }} · ￥{{ transaction?.amount }}
      </span>
      <span class="gallery-limit">{{ receipts.length }} / {{ RECEIPT_MAX_PER_TRANSACTION }}</span>
    </div>

    <div v-loading="loading" class="gallery">
      <div v-for="receipt in receipts" :key="receipt.id" class="card">
        <el-image
          v-if="previews[receipt.id]"
          class="thumb"
          :src="previews[receipt.id]"
          fit="cover"
          :preview-src-list="previewList"
          :initial-index="receipts.findIndex((r) => r.id === receipt.id)"
          preview-teleported
        />
        <div v-else class="thumb thumb-empty">图片加载失败</div>

        <el-input
          v-model="titles[receipt.id]"
          size="small"
          maxlength="30"
          class="title-input"
          @blur="saveTitle(receipt)"
          @keyup.enter="saveTitle(receipt)"
        />
        <div class="meta">
          <span>{{ formatSize(receipt.sizeBytes) }}</span>
          <el-button text size="small" type="danger" @click="remove(receipt)">删除</el-button>
        </div>
      </div>

      <label v-if="receipts.length < RECEIPT_MAX_PER_TRANSACTION" class="add" :class="{ disabled: uploading }">
        <input type="file" :accept="RECEIPT_ACCEPT" multiple hidden @change="onPick" />
        <span class="add-plus">+</span>
        <span class="add-text">添加图片</span>
        <span class="add-hint">jpg/png/webp · ≤5MB</span>
      </label>
    </div>

    <div v-if="receipts.length === 0 && !loading" class="empty">这笔流水还没有票据</div>

    <template #footer>
      <el-button :disabled="receipts.length === 0" @click="exportSingle">导出这笔票据</el-button>
      <el-button type="primary" @click="visible = false">完成</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.gallery-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  min-height: 120px;
}

.card {
  display: grid;
  gap: 6px;
  padding: 8px;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.thumb {
  width: 100%;
  height: 110px;
  border-radius: 8px;
  background: #fff;
}

.thumb-empty {
  display: grid;
  place-items: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.title-input :deep(.el-input__inner) {
  font-size: 12px;
}

.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.add {
  display: grid;
  place-items: center;
  gap: 2px;
  height: 120px;
  border: 1px dashed var(--el-border-color);
  border-radius: 10px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
}

.add.disabled {
  pointer-events: none;
  opacity: 0.6;
}

.add-plus {
  font-size: 22px;
  line-height: 1;
}

.add-text {
  font-size: 13px;
}

.add-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.empty {
  margin-top: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>