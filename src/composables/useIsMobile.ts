import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * 窄屏判断（≤767px，和 CSS 的 `@media (max-width: 767px)` 同一档）。
 *
 * <p>为什么需要 JS 版：有些组件**只能靠换一种渲染方式**解决窄屏问题，
 * 单靠 CSS 改不动。典型是 Element Plus 的 `daterange`——它的面板固定约 646px 宽，
 * 手机上右半边（含「确定」）直接出屏幕，看不到也点不着；换成两个单日选择器（各 322px）才装得下。
 */
export function useIsMobile(): Ref<boolean> {
  const isMobile = ref(false)
  let query: MediaQueryList | null = null

  const update = (): void => {
    if (query) isMobile.value = query.matches
  }

  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    query = window.matchMedia('(max-width: 767px)')
    update()
    query.addEventListener('change', update)
  })

  onBeforeUnmount(() => {
    query?.removeEventListener('change', update)
  })

  return isMobile
}