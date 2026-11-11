import { describe, expect, it } from 'vitest'
import { isTruncated } from '../ellipsis'

/** 只有真的被省略（scrollWidth > clientWidth）才响应点击 */

function fakeEl(scrollWidth: number, clientWidth: number): HTMLElement {
  const el = document.createElement('span')
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth })
  Object.defineProperty(el, 'clientWidth', { value: clientWidth })
  return el
}

describe('isTruncated', () => {
  it('内容比容器宽：被省略', () => {
    expect(isTruncated(fakeEl(260, 120))).toBe(true)
  })

  it('放得下：没省略', () => {
    expect(isTruncated(fakeEl(100, 120))).toBe(false)
  })

  it('1px 的取整误差不算省略', () => {
    expect(isTruncated(fakeEl(121, 120))).toBe(false)
  })

  it('不是元素（null / 文本节点）：false', () => {
    expect(isTruncated(null)).toBe(false)
    expect(isTruncated(document.createTextNode('x'))).toBe(false)
  })
})
