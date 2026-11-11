<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElImageViewer, ElMessage, ElMessageBox } from 'element-plus'
import {
  deleteReceipt,
  exportTransactionReceipts,
  fetchReceiptBlob,
  importReceiptsZip,
  listReceipts,
  renameReceipt,
  uploadReceipt,
} from '../api/receipt'
import { publicReceiptUrl } from '../api/receipt'
import { saveBlob } from '../api/request'
import {
  RECEIPT_ACCEPT,
  RECEIPT_MAX_PER_TRANSACTION,
  compressReceiptImage,
  defaultReceiptTitle,
  formatSize,
  validateReceiptFile,
} from '../utils/receipt'
import type { PublicReceipt, Receipt, Transaction } from '../types/api'

/**
 * 一笔流水的票据图集：看缩略图、改名、删除、再加几张、把这一笔的图下载下来。
 * <p>改动是草稿语义，点保存才提交。
 * <p>`readonly` + `shareToken` 用于公示页：只显示，不给改名/删除/上传，图片直接用匿名地址。
 *
 * <p>**取图分两档**（云服务器出网 2Mbps，这是全局最要紧的约束）：
 * 网格只拉 480px 缩略图（约 45KB），点开大图才拉原图；
 * 两者都做了跨弹窗缓存，关掉再打开不会重新下载。
 */
const props = defineProps<{
  modelValue: boolean
  /** 管理端传当前流水；公示页不传 */
  transaction?: Transaction | null
  readonly?: boolean
  shareToken?: string
  publicReceipts?: PublicReceipt[]
  /** 弹窗顶部那行说明 */
  headText?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** 保存成功后通知父组件刷新列表（徽标数字要变） */
  changed: []
}>()

interface PendingReceipt {
  file: File
  title: string
  /** 本地预览用的 objectURL */
  url: string
  /** 客户端生成的临时 key，用来做 v-for 的 key 与删除 */
  key: string
}

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

/** 压缩包导入的失败明细（成功的不列，弹窗里直接看图即可） */
const importFailed = ref<{ file: string; reason: string }[]>([])
const importing = ref(false)

const loading = ref(false)
const saving = ref(false)
/** 库里已有的票据（加载时的快照，删除/改名都以它为基准） */
const receipts = ref<Receipt[]>([])
/** 待上传的新图（只在本弹窗内有效） */
const pending = ref<PendingReceipt[]>([])
/** 客户端标题；已有票据改名也走这里，保存时统一提交 */
const titles = reactive<Record<number, string>>({})
/** 标记删除的已有票据 id（保存时才真的删） */
const removed = reactive<Set<number>>(new Set())
/** receiptId → 缩略图地址（管理端是 blob objectURL，公示页是匿名直链） */
const thumbs = reactive<Record<number, string>>({})
/** receiptId → 原图 objectURL（点开大图时才拉） */
const fulls = reactive<Record<number, string>>({})
/** 正在拉原图的 receiptId（卡片上给个「加载中」的提示） */
const opening = reactive<Set<number>>(new Set())
/** 缩略图确定失败的 receiptId：加载中显示骨架，只有真失败才显示文案 */
const failed = reactive<Set<number>>(new Set())

/**
 * 跨弹窗的 objectURL 缓存：一台机器 2Mbps，重开一次弹窗把 9 张缩略图重下就是无谓的等待。
 * 上限 200 条，超了从最早的开始回收，避免长时间使用后内存一直涨。
 */
const CACHE_LIMIT = 200
const thumbCache = new Map<string, string>()
const fullCache = new Map<string, string>()

function remember(cache: Map<string, string>, key: string, url: string): void {
  cache.set(key, url)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string | undefined
    if (oldest === undefined) break
    const dropped = cache.get(oldest)
    cache.delete(oldest)
    if (dropped) URL.revokeObjectURL(dropped)
  }
}

function cacheKey(receiptId: number): string {
  return `${props.transaction?.id ?? 0}:${receiptId}`
}

/** 只回收「本次临时创建、又不在缓存里」的 blob；缓存里的要留着给下次打开用 */
function revokeAll(): void {
  const cached = new Set([...thumbCache.values(), ...fullCache.values()])
  const release = (url: string | undefined): void => {
    if (url && url.startsWith('blob:') && !cached.has(url)) {
      URL.revokeObjectURL(url)
    }
  }
  Object.values(thumbs).forEach(release)
  Object.values(fulls).forEach(release)
  pending.value.forEach((item) => URL.revokeObjectURL(item.url))
  Object.keys(thumbs).forEach((key) => delete thumbs[Number(key)])
  Object.keys(fulls).forEach((key) => delete fulls[Number(key)])
}

function resetState(): void {
  revokeAll()
  receipts.value = []
  pending.value = []
  removed.clear()
  failed.clear()
  opening.clear()
  viewerOpen.value = false
  Object.keys(titles).forEach((key) => delete titles[Number(key)])
}

async function load(): Promise<void> {
  if (props.readonly) {
    resetState()
    const items = props.publicReceipts ?? []
    receipts.value = items.map((r) => ({
      id: r.id,
      title: r.title,
      originalName: null,
      sizeBytes: 0,
      createdAt: '',
    }))
    items.forEach((r) => {
      titles[r.id] = r.title
      // 公示页是匿名接口，直接当 img src 用；缩略图走 size=thumb，原图点开时才加载
      thumbs[r.id] = publicReceiptUrl(props.shareToken ?? '', r.id, 'thumb')
    })
    return
  }

  const tx = props.transaction
  if (!tx) return
  loading.value = true
  resetState()
  try {
    receipts.value = await listReceipts(tx.id)
    receipts.value.forEach((r) => {
      titles[r.id] = r.title
    })
    // 缩略图很小（约 45KB），9 张并发拉也不会把 2Mbps 压满
    await Promise.all(receipts.value.map((r) => ensureThumb(r.id)))
  } finally {
    loading.value = false
  }
}

/** 拉缩略图：命中缓存就直接用，失败只记状态（不弹提示，拦截器已经提示过） */
async function ensureThumb(receiptId: number): Promise<void> {
  const key = cacheKey(receiptId)
  const cached = thumbCache.get(key)
  if (cached) {
    thumbs[receiptId] = cached
    return
  }
  const tx = props.transaction
  if (!tx || props.readonly) return
  try {
    const blob = await fetchReceiptBlob(tx.id, receiptId, 'thumb')
    thumbs[receiptId] = rememberUrl(thumbCache, key, blob)
  } catch {
    failed.add(receiptId)
  }
}

function rememberUrl(cache: Map<string, string>, key: string, blob: Blob): string {
  const cached = cache.get(key)
  if (cached) return cached
  const url = URL.createObjectURL(blob)
  remember(cache, key, url)
  return url
}

/**
 * 拉原图（点开大图 / 大图翻页时才调用）。
 * <p>不预取整组：9 张原图 20MB，在 2Mbps 上等于把管子堵死，用户还未必看。
 */
async function ensureFull(receiptId: number): Promise<void> {
  if (props.readonly || fulls[receiptId] || opening.has(receiptId)) return
  const tx = props.transaction
  if (!tx) return
  const key = cacheKey(receiptId)
  const cached = fullCache.get(key)
  if (cached) {
    fulls[receiptId] = cached
    return
  }
  opening.add(receiptId)
  try {
    const blob = await fetchReceiptBlob(tx.id, receiptId, 'full')
    fulls[receiptId] = rememberUrl(fullCache, key, blob)
  } catch {
    // 拦截器已提示；大图打不开就停在缩略图上，不影响其他操作
  } finally {
    opening.delete(receiptId)
  }
}

/* ---------- 展示 ---------- */

/** 列表里还剩的已有票据（排除已标记删除的） */
const kept = computed(() => receipts.value.filter((r) => !removed.has(r.id)))

/* ---------- 大图查看器 ---------- */

const viewerOpen = ref(false)
const viewerIndex = ref(0)
/** 查看器里的条目顺序：已有票据在前，待上传的在后（`r:11` / `p:0`） */
const viewerKeys = ref<string[]>([])

/** 大图地址：已拉到原图用原图，没拉到就先用缩略图顶着（切过去时会自动补原图） */
function fullUrlOf(receiptId: number): string {
  if (props.readonly) {
    return publicReceiptUrl(props.shareToken ?? '', receiptId, 'full')
  }
  return fulls[receiptId] ?? thumbs[receiptId] ?? ''
}

const viewerUrls = computed(() =>
  // 不 filter：长度一变，initialIndex 就错位了；空串最多是某个缩略图没拉到
  viewerKeys.value.map((key) => {
    if (key.startsWith('p:')) {
      return pending.value[Number(key.slice(2))]?.url ?? ''
    }
    return fullUrlOf(Number(key.slice(2)))
  }),
)

function keysOfCurrent(): string[] {
  return [
    ...kept.value.map((r) => `r:${r.id}`),
    ...pending.value.map((_, index) => `p:${index}`),
  ]
}

async function openPreview(key: string): Promise<void> {
  viewerKeys.value = keysOfCurrent()
  viewerIndex.value = Math.max(0, viewerKeys.value.indexOf(key))
  if (!key.startsWith('p:')) {
    const receiptId = Number(key.slice(2))
    // 先等原图再开：否则大图会先闪一张糊的再变清楚
    await ensureFull(receiptId)
  }
  viewerOpen.value = true
}

/** 在大图里翻页时，把当前这张的原图补上（列表长度不变，只是 URL 换成原图） */
function onViewerSwitch(index: number): void {
  const key = viewerKeys.value[index]
  if (key?.startsWith('r:')) {
    void ensureFull(Number(key.slice(2)))
  }
}

/* ---------- 关闭时确认「有未保存的改动」 ---------- */

const dirty = computed(() => {
  if (pending.value.length > 0 || removed.size > 0) return true
  return receipts.value.some((r) => !removed.has(r.id) && titles[r.id] !== r.title)
})

async function handleBeforeClose(): Promise<boolean> {
  if (!dirty.value || saving.value) return true
  try {
    await ElMessageBox.confirm('有未保存的改动，关闭后将不会保存，确定放弃？', '放弃改动', {
      type: 'warning',
      confirmButtonText: '放弃',
      cancelButtonText: '继续编辑',
    })
    return true
  } catch {
    return false
  }
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) await load()
    else resetState()
  },
)

onBeforeUnmount(revokeAll)

/* ---------- 展示 ---------- */

/**
 * 缩略图三态：取图是异步的（blob → objectURL），加载中不能显示「加载失败」。
 * 只有真失败了才给文案，否则一直留在 skeleton。
 */
function thumbState(id: number): 'ok' | 'loading' | 'failed' {
  if (thumbs[id]) return 'ok'
  return failed.has(id) ? 'failed' : 'loading'
}

const canAddMore = computed(
  () => kept.value.length + pending.value.length < RECEIPT_MAX_PER_TRANSACTION,
)

/* ---------- 编辑动作（都只改本地状态） ---------- */

function removeSaved(receipt: Receipt): void {
  removed.add(receipt.id)
  delete titles[receipt.id]
}

function undoRemove(receipt: Receipt): void {
  removed.delete(receipt.id)
  titles[receipt.id] = receipt.title
}

function removePending(index: number): void {
  URL.revokeObjectURL(pending.value[index].url)
  pending.value.splice(index, 1)
}

/**
 * 选图：只暂存，保存时才上传。
 * 先按原始文件校验（类型/大小），再压图——压完通常都远小于 10MB，
 * 但「超 10MB 就拒」要对用户的原图判断，不能先压再放行。
 */
async function onPick(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = '' // 允许连续选同一个文件
  if (files.length === 0) return

  for (const file of files) {
    const error = validateReceiptFile(file, kept.value.length + pending.value.length)
    if (error) {
      ElMessage.warning(error)
      continue
    }
    const compressed = await compressReceiptImage(file)
    pending.value.push({
      file: compressed,
      title: defaultReceiptTitle(file.name),
      url: URL.createObjectURL(compressed),
      key: `${file.name}-${compressed.size}-${Date.now()}-${pending.value.length}`,
    })
  }
}

/* ---------- 保存：删除 → 改名 → 上传 ---------- */

async function save(): Promise<void> {
  const tx = props.transaction
  if (!tx || saving.value) return
  saving.value = true
  let failed = 0
  try {
    for (const id of removed) {
      try {
        await deleteReceipt(tx.id, id)
      } catch {
        failed += 1
      }
    }
    for (const receipt of receipts.value) {
      if (removed.has(receipt.id)) continue
      const next = (titles[receipt.id] ?? '').trim()
      if (!next || next === receipt.title) continue
      try {
        await renameReceipt(tx.id, receipt.id, next)
        receipt.title = next
      } catch {
        failed += 1
      }
    }
    for (const item of pending.value) {
      try {
        await uploadReceipt(tx.id, item.file, item.title.trim() || undefined)
      } catch {
        failed += 1
      }
    }

    if (failed > 0) {
      ElMessage.warning(`有 ${failed} 项没保存成功，请重试`)
      await load() // 重新拉一次，把已成功的部分对齐
      emit('changed')
      return
    }
    ElMessage.success('已保存')
    emit('changed')
    visible.value = false
  } finally {
    saving.value = false
  }
}

/**
 * 压缩包导入：这是**立即生效**的动作（后端解包后直接落库），
 * 不进「待保存」列表，导入完刷新列表并提示。失败项列在下方，让用户知道哪几张没进来。
 */
async function onImportZip(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const tx = props.transaction
  if (!tx || !file) return

  importing.value = true
  importFailed.value = []
  try {
    const result = await importReceiptsZip(tx.id, file)
    importFailed.value = result.failed
    if (result.success > 0) {
      ElMessage.success(`已导入 ${result.success} 张票据`)
      emit('changed')
    }
    if (result.failed.length > 0) {
      ElMessage.warning(`有 ${result.failed.length} 个文件没导入，见下方清单`)
    }
    await load()
  } catch {
    // 拦截器已提示（如不是 zip、包内没有图片）
  } finally {
    importing.value = false
  }
}

/** 把这一笔的票据打包导出（zip 里图片统一放在「图片/」文件夹） */
async function exportZip(): Promise<void> {
  const tx = props.transaction
  if (!tx || kept.value.length === 0) return
  try {
    const file = await exportTransactionReceipts(tx.id)
    saveBlob(file.blob, file.filename)
  } catch {
    // 拦截器已提示（没有票据时是 400 + 文案）
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="票据"
    width="min(560px, 94vw)"
    destroy-on-close
    :before-close="(done: () => void) => handleBeforeClose().then((ok) => ok && done())"
  >
    <div class="gallery-head">
      <span class="gallery-tip">
        {{ headText ?? `${transaction?.categoryName} · ${transaction?.transDate} · ￥${transaction?.amount}` }}
      </span>
      <span v-if="!readonly" class="gallery-limit">
        {{ kept.length + pending.length }} / {{ RECEIPT_MAX_PER_TRANSACTION }}
      </span>
    </div>

    <div
      v-loading="loading"
      element-loading-background="rgba(255, 255, 255, 0.6)"
      class="gallery"
    >
      <!-- 库里已有的：删除/改名只改本地，点「保存」才提交 -->
      <div
        v-for="receipt in kept"
        :key="receipt.id"
        class="card"
        :class="{ changed: titles[receipt.id] !== receipt.title }"
      >
        <button
          v-if="thumbState(receipt.id) === 'ok'"
          type="button"
          class="thumb-btn"
          @click="openPreview(`r:${receipt.id}`)"
        >
          <img class="thumb" :src="thumbs[receipt.id]" alt="" loading="lazy" />
          <span v-if="opening.has(receipt.id)" class="thumb-mask">正在加载原图…</span>
        </button>
        <div v-else-if="thumbState(receipt.id) === 'failed'" class="thumb thumb-failed">
          图片加载失败
        </div>
        <div v-else class="thumb thumb-loading" />

        <el-input v-if="!readonly" v-model="titles[receipt.id]" size="small" maxlength="30" class="title-input" />
        <div v-else class="title-text">{{ receipt.title }}</div>
        <div class="meta">
          <span v-if="!readonly">{{ formatSize(receipt.sizeBytes) }}</span>
          <span v-else />
          <el-button v-if="!readonly" text size="small" type="danger" @click="removeSaved(receipt)">
            删除
          </el-button>
        </div>
      </div>

      <!-- 本次新选的：还没上传 -->
      <div v-for="(item, index) in pending" :key="item.key" class="card pending">
        <button type="button" class="thumb-btn" @click="openPreview(`p:${index}`)">
          <img class="thumb" :src="item.url" alt="" />
        </button>
        <el-input v-model="item.title" size="small" maxlength="30" class="title-input" />
        <div class="meta">
          <span>{{ formatSize(item.file.size) }} · 待保存</span>
          <el-button text size="small" type="danger" @click="removePending(index)">移除</el-button>
        </div>
      </div>

      <label v-if="!readonly && canAddMore" class="add">
        <input type="file" :accept="RECEIPT_ACCEPT" multiple hidden @change="onPick" />
        <span class="add-plus">+</span>
        <span class="add-text">添加图片</span>
        <span class="add-hint">jpg/png/webp · ≤10MB</span>
      </label>
    </div>

    <!-- 压缩包导入：立即生效，不走「待保存」 -->
    <div v-if="!readonly" class="zip-row">
      <label class="zip-btn" :class="{ busy: importing }">
        <input type="file" accept=".zip" hidden @change="onImportZip" />
        📦 导入压缩包（多张图打包，立即生效，≤200MB）
      </label>
    </div>

    <div v-if="importFailed.length" class="import-failed">
      <div class="import-failed-title">没导入成功的文件：</div>
      <div v-for="item in importFailed" :key="item.file" class="import-failed-row">
        <span class="file">{{ item.file }}</span>
        <span class="reason">{{ item.reason }}</span>
      </div>
    </div>

    <div v-if="removed.size > 0" class="undo">
      <span>已标记删除 {{ removed.size }} 张</span>
      <el-button
        v-for="receipt in receipts.filter((r) => removed.has(r.id))"
        :key="receipt.id"
        text
        size="small"
        @click="undoRemove(receipt)"
      >
        撤销「{{ receipt.title }}」
      </el-button>
    </div>

    <div v-if="kept.length + pending.length === 0 && !loading" class="empty">这笔流水还没有票据</div>

    <template #footer>
      <template v-if="!readonly">
        <el-button :disabled="kept.length === 0" @click="exportZip">导出压缩包</el-button>
        <el-button type="primary" :loading="saving" :disabled="!dirty" @click="save">保存</el-button>
      </template>
      <el-button v-else @click="visible = false">关闭</el-button>
    </template>

    <!-- 大图：点开才拉原图，翻页时把当前这张补上 -->
    <el-image-viewer
      v-if="viewerOpen"
      :url-list="viewerUrls"
      :initial-index="viewerIndex"
      teleported
      @close="viewerOpen = false"
      @switch="onViewerSwitch"
    />
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
  border: 1px solid transparent;
}

/* 改过标题的卡片给个提示，免得用户以为已经存了 */
.card.changed {
  border-color: var(--el-color-warning-light-5);
}

.card.pending {
  border-color: var(--el-color-primary-light-7);
}

/* 缩略图整块可点开大图；button 复位成透明容器 */
.thumb-btn {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  cursor: zoom-in;
}

.thumb {
  width: 100%;
  height: 110px;
  object-fit: cover;
  /* 长截图缩略图是「顶部裁切」的，对齐顶部才能看到抬头/金额，而不是中间一截 */
  object-position: top;
  border-radius: 8px;
  background: #fff;
}

/* 拉原图时的遮罩：让人知道「点了、在等」，而不是没反应 */
.thumb-mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: rgb(0 0 0 / 45%);
  font-size: 12px;
  color: #fff;
}

/* 加载中只给灰块（不写字，避免和「加载失败」混淆）；失败才给文案 */
.thumb-loading,
.thumb-failed {
  display: grid;
  place-items: center;
  width: 100%;
  height: 110px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.thumb-loading {
  background: var(--el-fill-color-darker);
  animation: thumb-pulse 1.2s ease-in-out infinite;
}

@keyframes thumb-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }
}

.title-input :deep(.el-input__inner) {
  font-size: 12px;
}

.title-text {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.zip-row {
  margin-top: 10px;
}

.zip-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-color-primary);
  cursor: pointer;
}

.zip-btn.busy {
  pointer-events: none;
  opacity: 0.6;
}

.import-failed {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--el-color-warning-light-9);
  font-size: 12px;
}

.import-failed-title {
  margin-bottom: 4px;
  color: var(--el-color-warning-dark-2);
}

.import-failed-row {
  display: flex;
  gap: 8px;
  color: var(--el-text-color-regular);
}

.import-failed-row .reason {
  color: var(--el-text-color-secondary);
}

.undo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.empty {
  margin-top: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
