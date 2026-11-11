<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { createTransaction, updateTransaction } from '../api/transaction'
import { createCategory } from '../api/category'
import { uploadReceipt } from '../api/receipt'
import CategoryFormDialog from './CategoryFormDialog.vue'
import { iconOf } from '../utils/category'
import { amountRule } from '../utils/validate'
import {
  RECEIPT_ACCEPT,
  RECEIPT_MAX_PER_TRANSACTION,
  defaultReceiptTitle,
  formatSize,
  validateReceiptFile,
} from '../utils/receipt'
import type { Category, Transaction, TxType } from '../types/api'

/**
 * 「记一笔」弹窗，新增与编辑共用（编辑时传 editing）。
 * 分类列表由父组件传入：它已经拉过一次，这里再请求一次只会让两个列表不一致。
 */

const props = defineProps<{
  modelValue: boolean
  categories: Category[]
  editing: Transaction | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
  /** 就地新建的分类：父组件负责塞进 shell.categories，这里只管选中它 */
  'category-created': [category: Category]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const title = computed(() => (props.editing ? '修改流水' : '记一笔'))

const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive({
  type: 'expense' as TxType,
  categoryId: null as number | null,
  amount: '',
  transDate: today(),
  note: '',
})

function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 只展示当前收支方向下的分类，避免「选了支出分类却记成收入」 */
const typeCategories = computed(() => props.categories.filter((c) => c.type === form.type))

/* ---------- 「其他」= 现建分类 ---------- */

/**
 * 下拉末尾的「其他」不是真分类，是个 -1 哨兵：选中就弹窗现建（可挑图标/颜色），
 * 建完自动选中。所以模板/预置分类里故意不再有「其他」这一条。
 */
const OTHER = -1

const categoryDialogVisible = ref(false)
const creatingCategory = ref(false)

/** 记住上一个有效分类：选中「其他」时把 v-model 回退，免得下拉停在哨兵上 */
let lastCategoryId: number | null = null
watch(
  () => form.categoryId,
  (value) => {
    if (value !== null && value !== OTHER) lastCategoryId = value
  },
)

function onCategoryChange(value: number | null): void {
  if (value !== OTHER) return
  form.categoryId = lastCategoryId
  categoryDialogVisible.value = true
}

/** 新建后不关「记一笔」：直接把新分类选中，用户接着填金额就行 */
async function onCreateCategory(payload: {
  name: string
  type: TxType
  icon: string
  color: string
}): Promise<void> {
  if (creatingCategory.value) return
  creatingCategory.value = true
  try {
    const created = await createCategory(payload)
    emit('category-created', created)
    form.categoryId = created.id
    categoryDialogVisible.value = false
    ElMessage.success(`已新增「${created.name}」并选中`)
  } catch {
    // 分类名重复等 400 已由拦截器弹出，弹窗保持打开让用户改
  } finally {
    creatingCategory.value = false
  }
}

const rules: FormRules = {
  categoryId: [{ required: true, message: '请选择分类', trigger: 'change' }],
  amount: [
    { required: true, message: '请输入金额', trigger: 'blur' },
    // 金额以字符串传后端；范围与后端 MoneyRules 一致（0.01 ~ 999,999.99）
    amountRule,
  ],
  transDate: [{ required: true, message: '请选择日期', trigger: 'change' }],
}

/* ---------- 票据：选完先本地预览，等流水保存成功（有 id）后再逐张上传 ---------- */

interface PendingReceipt {
  file: File
  title: string
  /** 本地预览用的 objectURL，移除/关闭时 revoke */
  url: string
}

const pending = ref<PendingReceipt[]>([])
const uploading = ref(false)

/** 还能不能再选图：已存 + 待上传 一起算，到 9 就把入口藏掉 */
const canAddMore = computed(
  () => (props.editing?.receiptCount ?? 0) + pending.value.length < RECEIPT_MAX_PER_TRANSACTION,
)

function clearPending(): void {
  pending.value.forEach((item) => URL.revokeObjectURL(item.url))
  pending.value = []
}

function onPickReceipts(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = '' // 允许再次选同一个文件
  if (files.length === 0) return

  // 已经存过的张数（编辑时才有）；循环里再加上本次已选的，逐个判上限
  const savedCount = props.editing?.receiptCount ?? 0
  for (const file of files) {
    const error = validateReceiptFile(file, savedCount + pending.value.length)
    if (error) {
      ElMessage.warning(error)
      continue
    }
    pending.value.push({ file, title: defaultReceiptTitle(file.name), url: URL.createObjectURL(file) })
  }
}

function removePending(index: number): void {
  URL.revokeObjectURL(pending.value[index].url)
  pending.value.splice(index, 1)
}

/** 上传在保存之后：没有 transactionId 之前票据挂不上去 */
async function uploadPending(transactionId: number): Promise<number> {
  if (pending.value.length === 0) return 0
  uploading.value = true
  let failed = 0
  try {
    for (const item of pending.value) {
      try {
        await uploadReceipt(transactionId, item.file, item.title.trim() || undefined)
      } catch {
        failed += 1
      }
    }
  } finally {
    uploading.value = false
    clearPending()
  }
  return failed
}

onBeforeUnmount(clearPending)

// 每次打开都按 editing 重置，避免上次的输入残留
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const tx = props.editing
    form.type = tx?.type ?? 'expense'
    form.amount = tx?.amount ?? ''
    form.transDate = tx?.transDate ?? today()
    form.note = tx?.note ?? ''
    form.categoryId = tx?.categoryId ?? typeCategories.value[0]?.id ?? null
    lastCategoryId = form.categoryId
    categoryDialogVisible.value = false
    clearPending()
    formRef.value?.clearValidate()
  },
)

// 切换收支方向时，若原分类不在新方向里，自动落到第一个
watch(
  () => form.type,
  () => {
    // 输入到一半换方向就关掉现建的弹窗，避免「名字填了、点保存却建到另一个方向」
    categoryDialogVisible.value = false
    if (!typeCategories.value.some((c) => c.id === form.categoryId)) {
      form.categoryId = typeCategories.value[0]?.id ?? null
      lastCategoryId = form.categoryId
    }
  },
)

async function onSubmit(): Promise<void> {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  // 单飞：连点只发一次请求（后端新增接口非幂等）
  if (submitting.value) return
  submitting.value = true
  try {
    const category = props.categories.find((c) => c.id === form.categoryId)
    if (!category) {
      ElMessage.error('分类不存在，请刷新后重试')
      return
    }
    // type 以分类为准，不信表单里可能残留的旧值（后端也会校验）
    const req = {
      categoryId: category.id,
      type: category.type,
      amount: form.amount,
      transDate: form.transDate,
      note: form.note.trim() || null,
    }
    // 票据要挂在流水上：必须先保存拿到 id，再逐张上传
    const saved = props.editing
      ? await updateTransaction(props.editing.id, req)
      : await createTransaction(req)
    const failed = await uploadPending(saved.id)

    if (failed > 0) {
      ElMessage.warning(`已保存，但有 ${failed} 张票据没传上去（可在流水右侧的票据里重试）`)
    } else {
      ElMessage.success(props.editing ? '已修改' : '已记一笔')
    }
    visible.value = false
    emit('saved')
  } catch {
    // 提示已由 axios 拦截器统一弹出（如分类不存在、归档只读的 400），这里只负责复位按钮
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" :title="title" width="min(440px, 92vw)" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="onSubmit">
      <el-form-item label="收支">
        <el-radio-group v-model="form.type">
          <el-radio-button value="expense">支出</el-radio-button>
          <el-radio-button value="income">收入</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="分类" prop="categoryId">
        <el-select
          v-model="form.categoryId"
          placeholder="请选择分类"
          style="width: 100%"
          @change="onCategoryChange"
        >
          <el-option
            v-for="c in typeCategories"
            :key="c.id"
            :label="`${iconOf(c.icon)} ${c.name}`"
            :value="c.id"
          />
          <el-option :value="OTHER" label="📌 其他（新建分类…）" />
        </el-select>
      </el-form-item>

      <el-form-item label="金额（元）" prop="amount">
        <el-input
          v-model="form.amount"
          inputmode="decimal"
          placeholder="0.01 ~ 999,999.99"
          maxlength="12"
          clearable
        />
      </el-form-item>

      <el-form-item label="日期" prop="transDate">
        <el-date-picker
          v-model="form.transDate"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择日期"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="备注">
        <el-input
          v-model="form.note"
          type="textarea"
          :rows="2"
          maxlength="255"
          show-word-limit
          placeholder="比如：班费买水（可不填）"
        />
      </el-form-item>

      <!-- 票据：选完先本地预览，保存成功后再逐张上传（要有 transactionId 才挂得上） -->
      <el-form-item :label="`票据（可选，最多 ${RECEIPT_MAX_PER_TRANSACTION} 张）`">
        <div class="receipt-picker">
          <div v-if="props.editing && props.editing.receiptCount > 0" class="receipt-existing">
            这笔已有 {{ props.editing.receiptCount }} 张票据，可在流水右侧「票据」里管理
          </div>
          <div v-if="pending.length" class="receipt-list">
            <div v-for="(item, index) in pending" :key="item.url" class="receipt-card">
              <img class="receipt-thumb" :src="item.url" alt="" />
              <el-input v-model="item.title" size="small" maxlength="30" />
              <div class="receipt-meta">
                <span>{{ formatSize(item.file.size) }}</span>
                <el-button text size="small" type="danger" @click="removePending(index)">移除</el-button>
              </div>
            </div>
          </div>
          <label v-if="canAddMore" class="receipt-add" :class="{ busy: uploading }">
            <input type="file" :accept="RECEIPT_ACCEPT" multiple hidden @change="onPickReceipts" />
            📎 选择图片（jpg/png/webp，单张 ≤10MB）
          </label>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="onSubmit">保存</el-button>
    </template>

    <!-- 选「其他」时现建分类：和分类管理页同一个表单，能挑图标与颜色 -->
    <CategoryFormDialog
      v-model="categoryDialogVisible"
      :type="form.type"
      title="新增分类"
      :saving="creatingCategory"
      @submit="onCreateCategory"
    />
  </el-dialog>
</template>

<style scoped>
.receipt-picker {
  display: grid;
  gap: 8px;
  width: 100%;
}

.receipt-existing {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.receipt-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}

.receipt-card {
  display: grid;
  gap: 4px;
  padding: 6px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}

.receipt-thumb {
  width: 100%;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
  background: #fff;
}

.receipt-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.receipt-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  justify-self: start;
}

.receipt-add.busy {
  pointer-events: none;
  opacity: 0.6;
}
</style>