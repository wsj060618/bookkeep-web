<script setup lang="ts">
import { computed } from 'vue'

/** 列表里被省略号截断的文字，点一下看全文（手机没有 hover，只能点） */
const props = defineProps<{
  modelValue: boolean
  title: string
  text: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})
</script>

<template>
  <el-dialog v-model="visible" :title="title" width="min(480px, 92vw)" append-to-body>
    <p class="peek-text">{{ text }}</p>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* 备注最长 255 字：限高可滚，保留用户自己打的换行，长英文也断得开 */
.peek-text {
  margin: 0;
  max-height: 56vh;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
  font-size: 14px;
}
</style>
