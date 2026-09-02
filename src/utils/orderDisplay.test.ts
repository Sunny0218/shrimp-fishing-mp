import type { Order } from '@/api/types/order'
import { describe, expect, it } from 'vitest'
import {
  getOrderBusinessDateText,
  getOrderExpectedEndedAtTime,
  getOrderRecordItems,
  getOrderTimeItems,
} from './orderDisplay'

function createOrder(overrides: Partial<Order> = {}): Order {
  return {
    _id: 'order_1',
    orderNo: 'SF202609020001',
    userId: 'user_1',
    openid: 'openid_1',
    orderType: 'package',
    status: 'paid',
    packageId: 'package_1',
    rodCount: 1,
    peopleCount: 1,
    baseAmount: 100,
    goodsAmount: 0,
    adjustAmount: 0,
    discountAmount: 0,
    paidAmount: 100,
    finalAmount: 100,
    remark: '',
    adminRemark: '',
    checkinCode: '12345678',
    createdBy: 'user_1',
    createdAt: '2026-09-02T10:00:00+08:00',
    updatedAt: '2026-09-02T10:00:00+08:00',
    ...overrides,
  }
}

describe('orderDisplay', () => {
  it('待核销订单优先展示预约时间和下单时间', () => {
    const items = getOrderTimeItems(createOrder({
      slotSnapshot: {
        slotId: 'slot_1',
        date: '2026-09-03',
        startTime: '14:00',
        endTime: '15:00',
      },
    }))

    expect(items).toEqual([
      { label: '预约时间', value: '2026-09-03 14:00-15:00' },
      { label: '下单时间', value: '2026-09-02 10:00' },
    ])
  })

  it('进行中订单按开始时间和套餐时长推导预计结束时间', () => {
    const order = createOrder({
      status: 'in_progress',
      startedAt: '2026-09-02T14:00:00+08:00',
      packageSnapshot: {
        packageId: 'package_1',
        name: '测试套餐',
        durationMinutes: 90,
        price: 100,
        rodCount: 1,
      },
    })

    expect(getOrderExpectedEndedAtTime(order)).toBe(new Date('2026-09-02T15:30:00+08:00').getTime())
    expect(getOrderTimeItems(order)).toEqual([
      { label: '开始时间', value: '2026-09-02 14:00' },
      { label: '预计结束', value: '2026-09-02 15:30' },
    ])
  })

  it('退款中订单展示退款摘要', () => {
    const items = getOrderRecordItems(createOrder({
      status: 'refund_pending',
      refundAt: '2026-09-02T16:10:00+08:00',
      refundReason: '顾客临时有事',
    }))

    expect(items).toEqual([
      { label: '退款状态', value: '处理中' },
      { label: '申请时间', value: '2026-09-02 16:10' },
      { label: '退款原因', value: '顾客临时有事' },
    ])
  })

  it('已退款订单展示退款金额和单号', () => {
    const items = getOrderRecordItems(createOrder({
      status: 'refunded',
      refundAmount: 12800,
      refundNo: 'REF202609020001',
      refundedAt: '2026-09-02T17:20:00+08:00',
    }))

    expect(items).toEqual([
      { label: '退款金额', value: '¥128' },
      { label: '退款时间', value: '2026-09-02 17:20' },
      { label: '退款单号', value: 'REF202609020001' },
    ])
  })

  it('已取消订单展示取消摘要并取取消日期作为业务日期', () => {
    const order = createOrder({
      status: 'cancelled',
      cancelledAt: '2026-09-04T09:20:00+08:00',
      cancelReason: '待支付超时自动关闭',
    })

    expect(getOrderBusinessDateText(order)).toBe('2026-09-04')
    expect(getOrderRecordItems(order)).toEqual([
      { label: '取消时间', value: '2026-09-04 09:20' },
      { label: '取消原因', value: '待支付超时自动关闭' },
    ])
  })
})
