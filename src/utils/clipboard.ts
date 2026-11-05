/**
 * 复制到剪贴板。
 *
 * 为什么需要兜底：局域网访问是 `http://192.168.x.x`，属于**非安全上下文**（secure context），
 * Chrome/Safari 在这种页面上根本不暴露 `navigator.clipboard`，直接调用会 `undefined` 报错 →
 * 就是手机上看到的「复制失败」。localhost 是特例（浏览器认为它安全），所以电脑上一直好用。
 *
 * 兜底方案 `document.execCommand('copy')` 已废弃但仍是 http 页面唯一可用的自动复制：
 * iOS Safari 还要求 textarea 可编辑 + 手动建立选区，所以下面几行看着啰嗦但缺一不可。
 * 返回 false 表示浏览器确实不给复制，调用方应提示用户长按手动选择。
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 有 API 但被拒（权限/焦点问题）：继续走 execCommand 兜底
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.contentEditable = 'true'
  textarea.readOnly = false
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)

  const selection = document.getSelection()
  const range = document.createRange()
  range.selectNodeContents(textarea)
  selection?.removeAllRanges()
  selection?.addRange(range)
  textarea.setSelectionRange(0, text.length)

  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }

  textarea.remove()
  selection?.removeAllRanges()
  return ok
}