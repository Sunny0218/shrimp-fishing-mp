import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface TestOrder {
  _id: string
  status: string
  createdAt?: string
  startedAt?: string
  checkedInAt?: string
  endedAt?: string
  finishedAt?: string
  completedAt?: string
  cancelledAt?: string
  refundedAt?: string
  refundAt?: string
  paymentExpiredAt?: string
  slotSnapshot?: {
    date?: string
  }
}

interface OrderQueryModule {
  normalizeStatus: (value?: unknown) => string
  normalizeDateRange: (event: Record<string, unknown>) => { startDate: string, endDate: string }
  normalizePagination: (event: Record<string, unknown>) => { page: number, pageSize: number, offset: number }
  getBusinessDate: (order: TestOrder) => string
  createSummary: (orders: TestOrder[]) => Record<string, number>
  filterOrders: (orders: TestOrder[], status: string) => TestOrder[]
  sortOrders: (orders: TestOrder[]) => TestOrder[]
  resolvePaymentExpiredAt: (order: TestOrder & { paymentExpiredAt?: string }, expireMinutes: number) => number
}

const require = createRequire(import.meta.url)
const orderQuery = require('../../cloudfunctions/common/orderQuery.js') as OrderQueryModule

function createOrder(_id: string, status: string, overrides: Partial<TestOrder> = {}): TestOrder {
  return {
    _id,
    status,
    createdAt: '2026-09-02T10:00:00+08:00',
    ...overrides,
  }
}

describe('cloudfunctions/common/orderQuery', () => {
  it('只接受支持的门店订单状态筛选', () => {
    expect(orderQuery.normalizeStatus('refunded')).toBe('refunded')
    expect(orderQuery.normalizeStatus('refund_pending')).toBe('refund_pending')
    expect(orderQuery.normalizeStatus('unknown')).toBe('active')
    expect(orderQuery.normalizeStatus()).toBe('active')
  })

  it('日期范围会自动纠正开始和结束顺序', () => {
    expect(orderQuery.normalizeDateRange({
      startDate: '2026-09-05',
      endDate: '2026-09-02',
    })).toEqual({
      startDate: '2026-09-02',
      endDate: '2026-09-05',
    })
  })

  it('分页参数有上下限兜底', () => {
    expect(orderQuery.normalizePagination({ page: 3, pageSize: 80 })).toEqual({
      page: 3,
      pageSize: 50,
      offset: 100,
    })
    expect(orderQuery.normalizePagination({ page: -1, pageSize: 0 })).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    })
  })

  it('统计待办、退款、取消等状态数量', () => {
    const summary = orderQuery.createSummary([
      createOrder('1', 'paid'),
      createOrder('2', 'in_progress'),
      createOrder('3', 'pending_checkout'),
      createOrder('4', 'completed'),
      createOrder('5', 'cancelled'),
      createOrder('6', 'refund_pending'),
      createOrder('7', 'refunded'),
    ])

    expect(summary).toMatchObject({
      all: 7,
      active: 3,
      paid: 1,
      inProgress: 1,
      pendingCheckout: 1,
      completed: 1,
      cancelled: 1,
      refundPending: 1,
      refunded: 1,
    })
  })

  it('按退款和待办状态筛选订单', () => {
    const orders = [
      createOrder('1', 'paid'),
      createOrder('2', 'pending_checkout'),
      createOrder('3', 'refunded'),
      createOrder('4', 'cancelled'),
    ]

    expect(orderQuery.filterOrders(orders, 'active').map(order => order._id)).toEqual(['1', '2'])
    expect(orderQuery.filterOrders(orders, 'refunded').map(order => order._id)).toEqual(['3'])
    expect(orderQuery.filterOrders(orders, 'all').map(order => order._id)).toEqual(['1', '2', '3', '4'])
  })

  it('业务日期按不同状态取对应时间字段', () => {
    expect(orderQuery.getBusinessDate(createOrder('1', 'paid', {
      slotSnapshot: { date: '2026-09-06' },
    }))).toBe('2026-09-06')
    expect(orderQuery.getBusinessDate(createOrder('2', 'cancelled', {
      cancelledAt: '2026-09-07T09:00:00+08:00',
    }))).toBe('2026-09-07')
    expect(orderQuery.getBusinessDate(createOrder('3', 'refunded', {
      refundedAt: '2026-09-08T09:00:00+08:00',
    }))).toBe('2026-09-08')
  })

  it('排序优先级先看状态，再看订单时间倒序', () => {
    const sorted = orderQuery.sortOrders([
      createOrder('old-paid', 'paid', { createdAt: '2026-09-02T10:00:00+08:00' }),
      createOrder('new-paid', 'paid', { createdAt: '2026-09-02T11:00:00+08:00' }),
      createOrder('running', 'in_progress', { startedAt: '2026-09-02T09:00:00+08:00' }),
      createOrder('done', 'completed', { completedAt: '2026-09-02T12:00:00+08:00' }),
    ])

    expect(sorted.map(order => order._id)).toEqual(['running', 'new-paid', 'old-paid', 'done'])
  })

  it('待支付过期时间优先使用已保存字段，否则用创建时间推导', () => {
    expect(orderQuery.resolvePaymentExpiredAt(createOrder('1', 'pending_payment', {
      paymentExpiredAt: '2026-09-02T10:03:00+08:00',
    }), 5)).toBe(new Date('2026-09-02T10:03:00+08:00').getTime())
    expect(orderQuery.resolvePaymentExpiredAt(createOrder('2', 'pending_payment', {
      createdAt: '2026-09-02T10:00:00+08:00',
    }), 5)).toBe(new Date('2026-09-02T10:05:00+08:00').getTime())
  })
})
