/**
 * 只有真的被省略时才响应点击：scrollWidth 比 clientWidth 大说明内容被截断。
 * 否则点一段短文本也弹窗，等于给了一个假交互。
 */
export function isTruncated(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.scrollWidth > target.clientWidth + 1
}
