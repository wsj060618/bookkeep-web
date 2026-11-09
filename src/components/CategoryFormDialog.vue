<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { COLOR_CHOICES, ICON_CHOICES } from '../utils/category'
import type { TxType } from '../types/api'

/**
 * 分类表单弹窗（名称 + 图标 + 颜色），三处共用：
 * 分类管理页新增/编辑、模板弹窗里新增/编辑条目、「记一笔」里从「其他」现建分类。
 * <p>**没有收支方向选择**：方向由调用方按场景固定死（在支出卡片里新增就是支出，
 * 记账时按当前收支方向），少一个能让用户选错的地方。
 */

const props = defineProps<{
  modelValue: boolean
  title?: string
  type: TxType
  /** 编辑时传入原值；新增传 null */
  initial?: { name: string; icon: string | null; color: string | null } | null
  /** 保存中：禁用按钮，避免连点 */
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [payload: { name: string; type: TxType; icon: string; color: string }]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const name = ref('')
const icon = ref('other')
const color = ref('gray')

const titleText = computed(
  () => props.title ?? (props.initial ? '编辑分类' : `新增${props.type === 'expense' ? '支出' : '收入'}分类`),
)

const defaultColor = computed(() => (props.type === 'expense' ? 'orange' : 'green'))

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    name.value = props.initial?.name ?? ''
    icon.value = props.initial?.icon ?? 'other'
    color.value = props.initial?.color ?? defaultColor.value
  },
)

function onSubmit(): void {
  const trimmed = name.value.trim()
  if (!trimmed) return
  emit('submit', { name: trimmed, type: props.type, icon: icon.value, color: color.value })
}
</script>

<template>
  <el-dialog v-model="visible" :title="titleText" width="min(460px, 92vw)" append-to-body>
    <el-form label-position="top" @submit.prevent="onSubmit">
      <el-form-item label="分类名">
        <el-input
          v-model="name"
          maxlength="50"
          show-word-limit
          placeholder="如：打印费"
          @keydown.enter.prevent="onSubmit"
        />
      </el-form-item>

      <el-form-item label="图标">
        <div class="picker">
          <button
            v-for="opt in ICON_CHOICES"
            :key="opt.key"
            type="button"
            class="pick"
            :class="{ active: icon === opt.key }"
            :title="opt.label"
            @click="icon = opt.key"
          >
            {{ opt.emoji }}
          </button>
        </div>
      </el-form-item>

      <el-form-item label="颜色">
        <div class="picker">
          <button
            v-for="opt in COLOR_CHOICES"
            :key="opt.key"
            type="button"
            class="pick color"
            :class="{ active: color === opt.key }"
            :title="opt.label"
            :style="{ background: opt.hex }"
            @click="color = opt.key"
          />
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!name.trim()" @click="onSubmit">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pick {
  width: 34px;
  height: 34px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  cursor: pointer;
}

.pick.color {
  border-width: 3px;
  border-color: transparent;
}

.pick.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
}
</style>