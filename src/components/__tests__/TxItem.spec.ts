import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TxItem from '../TxItem.vue'
import type { Transaction } from '../../types/api'

/**
 * 省略号点开全文：只有真的被截断才 emit，短文本/空备注点了不弹窗。
 * happy-dom 不做布局，宽高靠 defineProperty 造。
 */

const tx: Transaction = {
  id: 1,
  type: 'expense',
  amount: '11.00',
  transDate: '2026-11-10',
  note: '英语听力资料打印 数量: 40 单价: 0.4',
  categoryId: 3,
  categoryName: '资料打印',
  categoryIcon: 'print',
  categoryColor: 'blue',
  receiptCount: 1,
}

function setWidths(el: Element, scrollWidth: number, clientWidth: number): void {
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
}

describe('TxItem 省略号点开全文', () => {
  it('备注被截断：点一下把全文交给页面', async () => {
    const wrapper = mount(TxItem, { props: { tx } })
    const note = wrapper.find('.tx-note')
    setWidths(note.element, 260, 120)

    await note.trigger('click')

    expect(wrapper.emitted('peek')?.[0]).toEqual([tx.note, '备注'])
  })

  it('备注放得下：点了不弹窗', async () => {
    const wrapper = mount(TxItem, { props: { tx } })
    const note = wrapper.find('.tx-note')
    setWidths(note.element, 80, 120)

    await note.trigger('click')

    expect(wrapper.emitted('peek')).toBeUndefined()
  })

  it('没有备注（显示 —）：点了不弹窗', async () => {
    const wrapper = mount(TxItem, { props: { tx: { ...tx, note: null } } })
    const note = wrapper.find('.tx-note')
    setWidths(note.element, 260, 120)

    await note.trigger('click')

    expect(note.text()).toBe('—')
    expect(wrapper.emitted('peek')).toBeUndefined()
  })

  it('分类名被截断：点一下标题是「分类」', async () => {
    const wrapper = mount(TxItem, { props: { tx } })
    const category = wrapper.find('.tx-category')
    setWidths(category.element, 200, 100)

    await category.trigger('click')

    expect(wrapper.emitted('peek')?.[0]).toEqual([tx.categoryName, '分类'])
  })
})
