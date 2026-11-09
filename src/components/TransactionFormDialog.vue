<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { createTransaction, updateTransaction } from '../api/transaction'
import { createCategory } from '../api/category'
import { iconOf } from '../utils/category'
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

/* ---------- 就地新建分类 ---------- */

const addingCategory = ref(false)
const creatingCategory = ref(false)
const newCategoryName = ref('')

function startAdd(): void {
  addingCategory.value = true
  newCategoryName.value = ''
}

function cancelAdd(): void {
  addingCategory.value = false
  newCategoryName.value = ''
}

/** 新建后不关弹窗：直接把新分类选中，用户接着填金额就行 */
async function onCreateCategory(): Promise<void> {
  const name = newCategoryName.value.trim()
  if (!name) {
    ElMessage.warning('先给分类起个名字')
    return
  }
  if (creatingCategory.value) return
  creatingCategory.value = true
  try {
    const created = await createCategory({
      name,
      type: form.type,
      icon: 'other',
      color: form.type === 'expense' ? 'orange' : 'green',
    })
    emit('category-created', created)
    form.categoryId = created.id
    cancelAdd()
    ElMessage.success(`已新增「${created.name}」并选中`)
  } catch {
    // 分类名重复等 400 已由拦截器弹出，保留输入让用户改
  } finally {
    creatingCategory.value = false
  }
}

const rules: FormRules = {
  categoryId: [{ required: true, message: '请选择分类', trigger: 'change' }],
  amount: [
    { required: true, message: '请输入金额', trigger: 'blur' },
    {
      // 金额以字符串传后端（PLAN §5.0：BigDecimal 按字符串序列化），前端只需保证格式
      pattern: /^(?!0+(\.0{1,2})?$)\d{1,10}(\.\d{1,2})?$/,
      message: '金额需大于 0，最多两位小数',
      trigger: 'blur',
    },
  ],
  transDate: [{ required: true, message: '请选择日期', trigger: 'change' }],
}

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
    cancelAdd()
    formRef.value?.clearValidate()
  },
)

// 切换收支方向时，若原分类不在新方向里，自动落到第一个
watch(
  () => form.type,
  () => {
    // 输入到一半换方向就放弃这次新建，避免"名字填了、点保存却建到另一个方向"
    cancelAdd()
    if (!typeCategories.value.some((c) => c.id === form.categoryId)) {
      form.categoryId = typeCategories.value[0]?.id ?? null
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
    if (props.editing) {
      await updateTransaction(props.editing.id, req)
    } else {
      await createTransaction(req)
    }
    ElMessage.success(props.editing ? '已修改' : '已记一笔')
    visible.value = false
    emit('saved')
  } catch {
    // 提示已由 axios 拦截器统一弹出（如支出超余额的 400），这里只负责复位按钮
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
        <div class="cat-field">
          <el-select v-model="form.categoryId" placeholder="请选择分类" style="width: 100%">
            <el-option
              v-for="c in typeCategories"
              :key="c.id"
              :label="`${iconOf(c.icon)} ${c.name}`"
              :value="c.id"
            />
          </el-select>

          <!-- 就地新建：不跳去分类管理页，建完直接选中，弹窗不关 -->
          <div v-if="addingCategory" class="cat-add-row">
            <el-input
              v-model="newCategoryName"
              size="small"
              maxlength="50"
              placeholder="新分类名，如：打印费"
              @keydown.enter.prevent="onCreateCategory"
            />
            <el-button
              size="small"
              type="primary"
              :loading="creatingCategory"
              @click="onCreateCategory"
            >
              新增并使用
            </el-button>
            <el-button size="small" text @click="cancelAdd">取消</el-button>
          </div>
          <el-button v-else class="cat-add-btn" size="small" text @click="startAdd">
            ＋ 新建分类
          </el-button>
        </div>
      </el-form-item>

      <el-form-item label="金额（元）" prop="amount">
        <el-input v-model="form.amount" inputmode="decimal" placeholder="0.00" clearable />
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
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="onSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.cat-field {
  width: 100%;
}

.cat-add-btn {
  margin-top: 2px;
  padding: 0;
  height: auto;
  font-size: 12px;
  color: var(--el-color-primary);
}

.cat-add-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.cat-add-row .el-input {
  flex: 1;
  min-width: 0;
}

@media (max-width: 480px) {
  .cat-add-row {
    flex-wrap: wrap;
  }
}
</style>