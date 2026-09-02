import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface MeteredRule {
  firstHourAmount: number
  extraPricePerHour: number
  minimumMinutes: number
  unitMinutes: number
}

interface RodSession {
  id: string
  label: string
  status: string
  startedAt?: Date | string
  stoppedAt?: Date | string | null
  endedAt?: Date | string | null
  paidAmount?: number
  segments?: Array<{
    startedAt: Date | string
    stoppedAt?: Date | string | null
  }>
  actualDurationMinutes?: number
  chargedMinutes?: number
  amount?: number
  checkoutAmount?: number
}

interface MeteredOrder {
  rodCount: number
  startedAt?: Date | string
  checkedInAt?: Date | string
  paidAmount?: number
  pricingRuleSnapshot?: Record<string, unknown>
  rodSessions?: RodSession[]
}

interface MeteredBillingModule {
  getMeteredRule: (order: MeteredOrder) => MeteredRule | null
  calculateMeteredAmount: (actualDurationMinutes: number, rule: MeteredRule) => {
    chargedMinutes: number
    chargedExtraMinutes: number
    amount: number
  }
  normalizeRodSessions: (order: MeteredOrder, now: Date, rule: MeteredRule) => RodSession[]
  updateTargetRodSession: (session: RodSession, action: string, now: Date) => RodSession
  calculateRodSession: (session: RodSession, order: MeteredOrder, now: Date, rule: MeteredRule) => RodSession
  getOrderSummary: (rodSessions: RodSession[], order: MeteredOrder) => {
    amount: number
    paidAmount: number
    checkoutAmount: number
    actualDurationMinutes: number
    chargedMeteredMinutes: number
  }
}

const require = createRequire(import.meta.url)
const billing = require('../../cloudfunctions/common/meteredBilling.js') as MeteredBillingModule
const rule: MeteredRule = {
  firstHourAmount: 5000,
  extraPricePerHour: 4500,
  minimumMinutes: 60,
  unitMinutes: 30,
}

describe('cloudfunctions/common/meteredBilling', () => {
  it('按首小时和续钟粒度计算现场计时金额', () => {
    expect(billing.calculateMeteredAmount(45, rule)).toEqual({
      chargedMinutes: 60,
      chargedExtraMinutes: 0,
      amount: 5000,
    })
    expect(billing.calculateMeteredAmount(61, rule)).toEqual({
      chargedMinutes: 90,
      chargedExtraMinutes: 30,
      amount: 7250,
    })
    expect(billing.calculateMeteredAmount(121, rule)).toEqual({
      chargedMinutes: 150,
      chargedExtraMinutes: 90,
      amount: 11750,
    })
  })

  it('从订单快照生成有效计费规则', () => {
    expect(billing.getMeteredRule({
      rodCount: 1,
      pricingRuleSnapshot: {
        pricePerHour: 6800,
        firstHourAmount: 6800,
        extraPricePerHour: 5800,
        minimumMinutes: 60,
        unitMinutes: 30,
      },
    })).toEqual({
      firstHourAmount: 6800,
      extraPricePerHour: 5800,
      minimumMinutes: 60,
      unitMinutes: 30,
    })
    expect(billing.getMeteredRule({
      rodCount: 1,
      pricingRuleSnapshot: {
        firstHourAmount: 0,
        extraPricePerHour: 5800,
        unitMinutes: 30,
      },
    })).toBeNull()
  })

  it('只停目标杆，不改变其他杆状态', () => {
    const now = new Date('2026-09-02T11:15:00+08:00')
    const order: MeteredOrder = {
      rodCount: 3,
      startedAt: '2026-09-02T10:00:00+08:00',
      rodSessions: [
        { id: 'rod_1', label: '1号杆', status: 'in_progress', startedAt: '2026-09-02T10:00:00+08:00', paidAmount: 5000 },
        { id: 'rod_2', label: '2号杆', status: 'in_progress', startedAt: '2026-09-02T10:00:00+08:00', paidAmount: 5000 },
        { id: 'rod_3', label: '3号杆', status: 'in_progress', startedAt: '2026-09-02T10:00:00+08:00', paidAmount: 5000 },
      ],
    }
    const sessions = billing.normalizeRodSessions(order, now, rule)
    const targetIndex = sessions.findIndex(session => session.id === 'rod_1')

    sessions[targetIndex] = billing.updateTargetRodSession(sessions[targetIndex], 'stop', now)
    const calculated = sessions.map(session => billing.calculateRodSession(session, order, now, rule))

    expect(calculated.map(session => session.status)).toEqual(['stopped', 'in_progress', 'in_progress'])
    expect(calculated[0].stoppedAt).toBe(now)
    expect(calculated[1].stoppedAt).toBeNull()
    expect(calculated[2].stoppedAt).toBeNull()
  })

  it('续钟只给目标杆追加新的计时片段', () => {
    const now = new Date('2026-09-02T12:00:00+08:00')
    const session: RodSession = {
      id: 'rod_1',
      label: '1号杆',
      status: 'stopped',
      startedAt: '2026-09-02T10:00:00+08:00',
      stoppedAt: '2026-09-02T11:00:00+08:00',
      segments: [
        {
          startedAt: '2026-09-02T10:00:00+08:00',
          stoppedAt: '2026-09-02T11:00:00+08:00',
        },
      ],
    }

    const resumed = billing.updateTargetRodSession(session, 'resume', now)

    expect(resumed.status).toBe('in_progress')
    expect(resumed.stoppedAt).toBeNull()
    expect(resumed.segments).toHaveLength(2)
    expect(resumed.segments?.[1]).toEqual({
      startedAt: now,
      stoppedAt: null,
    })
  })

  it('汇总多杆金额时只计算各杆待补差额', () => {
    const summary = billing.getOrderSummary([
      { id: 'rod_1', label: '1号杆', status: 'completed', amount: 5000, paidAmount: 5000, actualDurationMinutes: 60, chargedMinutes: 60 },
      { id: 'rod_2', label: '2号杆', status: 'completed', amount: 7250, paidAmount: 5000, actualDurationMinutes: 61, chargedMinutes: 90 },
      { id: 'rod_3', label: '3号杆', status: 'completed', amount: 9500, paidAmount: 5000, actualDurationMinutes: 100, chargedMinutes: 120 },
    ], {
      rodCount: 3,
      paidAmount: 15000,
    })

    expect(summary).toEqual({
      amount: 21750,
      paidAmount: 15000,
      checkoutAmount: 6750,
      actualDurationMinutes: 100,
      chargedMeteredMinutes: 120,
    })
  })

  it('非法停杆或续钟动作会抛出明确错误', () => {
    const now = new Date('2026-09-02T12:00:00+08:00')

    expect(() => billing.updateTargetRodSession({
      id: 'rod_1',
      label: '1号杆',
      status: 'stopped',
    }, 'stop', now)).toThrow('只有计时中的杆位可以停杆')
    expect(() => billing.updateTargetRodSession({
      id: 'rod_1',
      label: '1号杆',
      status: 'in_progress',
    }, 'resume', now)).toThrow('只有已停杆的杆位可以续钟')
  })
})
