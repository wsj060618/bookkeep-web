<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import CategoryFormDialog from './CategoryFormDialog.vue'
import { colorOf, iconOf } from '../utils/category'
import type { CategoryTemplate, TxType } from '../types/api'

/**
 * 新建 / 编辑分类模板：模板名 + 支出、收入两张卡片（右上角新增条目）。
 * <p>条目暂存在本地，点「保存」才整批提交（后端 PUT 带 items 时整体替换），
 * 所以中途取消不会留下半套模板。
 */

interface DraftItem {
  /** 已有条目的 id；新增条目没有。保存时带回后端，用来区分「改名」和「删旧建新」 */
  id?: number | null
  name: string
  type: TxType
  icon: string
  color: string
}

const props = defineProps<{
  modelValue: boolean
  /** 编辑时传入；新建传 null */
  template?: CategoryTemplate | null
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [payload: { name: string; items: DraftItem[] }]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const GROUPS: { type: TxType; title: string }[] = [
  { type: 'expense', title: '支出分类' },
  { type: 'income', title: '收入分类' },
]

const name = ref('')
const items = ref<DraftItem[]>([])

const titleText = computed(() => (props.template ? '编辑模板' : '新建模板'))

function byType(type: TxType): DraftItem[] {
  return items.value.filter((item) => item.type === type)
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    name.value = props.template?.name ?? ''
    items.value = (props.template?.items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      icon: item.icon ?? 'other',
      color: item.color ?? (item.type === 'expense' ? 'orange' : 'green'),
    }))
  },
)

/* ---------- 条目新增 / 编辑（复用分类表单弹窗，方向由所在卡片固定） ---------- */

const itemDialogVisible = ref(false)
const editingIndex = ref<number | null>(null)
const editingType = ref<TxType>('expense')
const editingInitial = reactive({ name: '', icon: 'other' as string | null, color: 'orange' as string | null })

function openItemCreate(type: TxType): void {
  editingIndex.value = null
  editingType.value = type
  editingInitial.name = ''
  editingInitial.icon = 'other'
  editingInitial.color = type === 'expense' ? 'orange' : 'green'
  itemDialogVisible.value = true
}

function openItemEdit(item: DraftItem): void {
  editingIndex.value = items.value.indexOf(item)
  editingType.value = item.type
  editingInitial.name = item.name
  editingInitial.icon = item.icon
  editingInitial.color = item.color
  itemDialogVisible.value = true
}

function onItemSubmit(payload: DraftItem): void {
  const index = editingIndex.value
  if (index === null) {
    items.value = [...items.value, payload]
  } else {
    // 分类弹窗只回名字/图标/颜色，id 得从原条目上带过来，否则「编辑」会变成「删旧建新」
    items.value = items.value.map((item, i) => (i === index ? { ...payload, id: item.id } : item))
  }
  itemDialogVisible.value = false
}

function removeItem(item: DraftItem): void {
  items.value = items.value.filter((i) => i !== item)
}

/* ---------- 保存 ---------- */

function onSubmit(): void {
  const trimmed = name.value.trim()
  if (!trimmed) {
    ElMessage.warning('先给模板起个名字')
    return
  }
  if (items.value.length === 0) {
    ElMessage.warning('模板至少要有 1 个分类')
    return
  }
  // 同方向重名后端也会拦，这里先挡一次，省得白跑一趟
  for (const group of GROUPS) {
    const names = byType(group.type).map((item) => item.name)
    const dup = names.find((n, i) => names.indexOf(n) !== i)
    if (dup) {
      ElMessage.warning(`${group.title}里有重名的「${dup}」`)
      return
    }
  }
  // 先支出后收入，和后端按顺序编的 sort_order 对齐
  emit('submit', {
    name: trimmed,
    items: [...byType('expense'), ...byType('income')],
  })
}
</script>

<template>
  <el-dialog v-model="visible" :title="titleText" width="min(560px, 94vw)" append-to-body>
    <el-form label-position="top" @submit.prevent="onSubmit">
      <el-form-item label="模板名">
        <el-input
          v-model="name"
          maxlength="50"
          show-word-limit
          placeholder="如：秋季学期"
          @keydown.enter.prevent="onSubmit"
        />
      </el-form-item>
    </el-form>

    <section v-for="group in GROUPS" :key="group.type" class="tpl-group">
      <header class="tpl-group-head">
        <h4 class="tpl-group-title">{{ group.title }}</h4>
        <el-button size="small" type="primary" plain @click="openItemCreate(group.type)">
          ＋ 新增
        </el-button>
      </header>

      <p v-if="byType(group.type).length === 0" class="tpl-empty">
        还没有{{ group.type === 'expense' ? '支出' : '收入' }}分类
      </p>

      <div v-for="item in byType(group.type)" :key="item.name" class="tpl-item">
        <span class="tpl-icon">{{ iconOf(item.icon) }}</span>
        <span class="tpl-name">{{ item.name }}</span>
        <span class="tpl-color" :style="{ background: colorOf(item.color) }" />
        <span class="tpl-ops">
          <el-button text size="small" @click="openItemEdit(item)">编辑</el-button>
          <el-button text size="small" type="danger" @click="removeItem(item)">删除</el-button>
        </span>
      </div>
    </section>

    <p class="tpl-tip">保存后用「新建账本」就能直接选用这套模板。</p>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSubmit">保存模板</el-button>
    </template>

    <CategoryFormDialog
      v-model="itemDialogVisible"
      :type="editingType"
      :initial="editingInitial"
      :title="editingIndex === null ? '新增分类' : '编辑分类'"
      @submit="onItemSubmit"
    />
  </el-dialog>
</template>

<style scoped>
.tpl-group {
  margin-bottom: 12px;
  padding: 12px;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.tpl-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.tpl-group-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.tpl-empty {
  margin: 4px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.tpl-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--el-bg-color);
}

.tpl-icon {
  flex: none;
  width: 22px;
  text-align: center;
  font-size: 16px;
}

.tpl-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.tpl-color {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.tpl-ops {
  display: flex;
  flex: none;
}

.tpl-tip {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
</style>