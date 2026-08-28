import type { Ref } from 'vue'
import { ref } from 'vue'
import type { Order, OrderDateValue, RodSession } from '@/api/types/order'
import { finishTimingOrder } from '@/api/order'

interface FinishTimingOptions {
  currentTime: Ref<number>
  canWaiveOvertime: Ref<boolean>
  onSuccess?: (order: Order) => Promise<void | boolean> | void
}

export function useFinishTimingOrder(options: FinishTimingOptions) {
  const finishingOrderId = ref('')

  function getDateTimeValue(value?: OrderDateValue) {
    if (!value) {
      return 0
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? 0 : value.getTime()
    }

    if (typeof value === 'object') {
      if (typeof value.toDate === 'function') {
        const date = value.toDate()

        return Number.isNaN(date.getTime()) ? 0 : date.getTime()
      }

      if (value.$date) {
        const time = new Date(value.$date).getTime()

        return Number.isNaN(time) ? 0 : time
      }
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const time = new Date(value).getTime()

      return Number.isNaN(time) ? 0 : time
    }

    return 0
  }

  function getExpectedEndedAtTime(order: Order) {
    const savedExpectedEndedAt = getDateTimeValue(order.expectedEndedAt)

    if (savedExpectedEndedAt) {
      return savedExpectedEndedAt
    }

    const startedAt = getDateTimeValue(order.startedAt || order.checkedInAt)
    const durationMinutes = order.packageSnapshot?.durationMinutes || 0

    if (!startedAt || durationMinutes <= 0) {
      return 0
    }

    return startedAt + durationMinutes * 60 * 1000
  }

  function getOvertimeMinutes(order: Order) {
    const expectedEndedAt = getExpectedEndedAtTime(order)

    if (!expectedEndedAt) {
      return 0
    }

    return Math.max(Math.ceil((options.currentTime.value - expectedEndedAt) / 60 / 1000), 0)
  }

  function getPackageOvertimeRule(order: Order) {
    const rule = order.pricingRuleSnapshot
    const pricePerHour = Number(rule?.pricePerHour || 0)
    const extraPricePerHour = Number(rule?.extraPricePerHour || pricePerHour)
    const unitMinutes = Number(rule?.unitMinutes || 60)

    if (extraPricePerHour <= 0 || unitMinutes <= 0) {
      return null
    }

    return {
      extraPricePerHour,
      unitMinutes,
    }
  }

  function getOvertimeAmount(order: Order, overtimeMinutes: number) {
    if (overtimeMinutes <= 0) {
      return 0
    }

    const rule = getPackageOvertimeRule(order)

    if (!rule) {
      return 0
    }

    const chargedMinutes = Math.ceil(overtimeMinutes / rule.unitMinutes) * rule.unitMinutes

    return Math.ceil((chargedMinutes / 60) * rule.extraPricePerHour)
  }

  function formatDuration(minutes?: number) {
    const duration = minutes || 0

    if (duration < 60) {
      return `${duration}分钟`
    }

    const hours = Math.floor(duration / 60)
    const restMinutes = duration % 60

    return restMinutes ? `${hours}小时${restMinutes}分钟` : `${hours}小时`
  }

  function getActualDurationMinutes(order: Order) {
    const startedAt = getDateTimeValue(order.startedAt || order.checkedInAt)

    if (!startedAt) {
      return 0
    }

    return Math.max(Math.ceil((options.currentTime.value - startedAt) / 60 / 1000), 0)
  }

  function getRodDurationMinutes(order: Order, session: RodSession) {
    if (Array.isArray(session.segments) && session.segments.length) {
      return session.segments.reduce((total, segment) => {
        const startedAt = getDateTimeValue(segment.startedAt)
        const stoppedAt = getDateTimeValue(segment.stoppedAt) || options.currentTime.value

        if (!startedAt || stoppedAt <= startedAt) {
          return total
        }

        return total + Math.ceil((stoppedAt - startedAt) / 60 / 1000)
      }, 0)
    }

    const startedAt = getDateTimeValue(session.startedAt || order.startedAt || order.checkedInAt)
    const endedAt = getDateTimeValue(session.stoppedAt || session.endedAt) || options.currentTime.value

    if (!startedAt || endedAt <= startedAt) {
      return 0
    }

    return Math.ceil((endedAt - startedAt) / 60 / 1000)
  }

  function getMeteredCheckout(order: Order) {
    const rule = order.pricingRuleSnapshot
    const pricePerHour = Number(rule?.pricePerHour || 0)
    const firstHourAmount = Number(rule?.firstHourAmount || pricePerHour)
    const extraPricePerHour = Number(rule?.extraPricePerHour || pricePerHour)
    const minimumMinutes = Number(rule?.minimumMinutes || 0)
    const unitMinutes = Number(rule?.unitMinutes || 60)

    if (firstHourAmount <= 0 || extraPricePerHour <= 0 || unitMinutes <= 0) {
      return null
    }

    const rodCount = Math.max(Math.floor(Number(order.rodCount || 1)), 1)
    const rodSessions = Array.isArray(order.rodSessions) && order.rodSessions.length
      ? order.rodSessions
      : Array.from({ length: rodCount }, (_, index) => ({
          id: `rod_${index + 1}`,
          label: `${index + 1}号杆`,
          status: 'in_progress' as const,
          startedAt: order.startedAt || order.checkedInAt,
          paidAmount: firstHourAmount,
        }))
    const results = rodSessions.map((session) => {
      const actualDurationMinutes = getRodDurationMinutes(order, session)
      const billableMinutes = Math.max(actualDurationMinutes, minimumMinutes)
      const extraMinutes = Math.max(billableMinutes - 60, 0)
      const chargedExtraMinutes = extraMinutes > 0
        ? Math.ceil(extraMinutes / unitMinutes) * unitMinutes
        : 0
      const chargedMinutes = Math.max(60, Math.min(billableMinutes, 60) + chargedExtraMinutes)
      const amount = firstHourAmount + Math.ceil((chargedExtraMinutes / 60) * extraPricePerHour)

      return {
        actualDurationMinutes,
        chargedMinutes,
        amount,
      }
    })
    const actualDurationMinutes = Math.max(...results.map(item => item.actualDurationMinutes), getActualDurationMinutes(order))
    const chargedMinutes = Math.max(...results.map(item => item.chargedMinutes), 0)
    const amount = results.reduce((total, item) => total + item.amount, 0)
    const checkoutAmount = Math.max(amount - Number(order.paidAmount || 0), 0)

    return {
      actualDurationMinutes,
      chargedMinutes,
      amount: checkoutAmount,
    }
  }

  function formatPrice(price?: number) {
    return `¥${((price || 0) / 100).toFixed(0)}`
  }

  async function submitFinishTiming(
    order: Order,
    payload: { waiveOvertime?: boolean, waiverReason?: string, earlyFinishReason?: string } = {},
  ) {
    finishingOrderId.value = order._id

    try {
      const res = await finishTimingOrder({
        orderId: order._id,
        waiveOvertime: !!payload.waiveOvertime,
        waiverReason: payload.waiverReason,
        earlyFinishReason: payload.earlyFinishReason,
      })
      uni.showToast({
        title: res.order.status === 'completed' ? '订单已完成' : '已进入待结账',
        icon: 'success',
      })
      await options.onSuccess?.(res.order)
    }
    catch (error) {
      uni.showToast({
        title: error instanceof Error ? error.message : '结束计时失败',
        icon: 'none',
      })
    }
    finally {
      finishingOrderId.value = ''
    }
  }

  function handleFinishWithoutOvertime(order: Order) {
    uni.showModal({
      title: '完成订单',
      content: `订单 ${order.orderNo} 未产生超时费用，确认完成订单吗？`,
      confirmText: '确认完成',
      confirmColor: '#1f6b56',
      success: (res) => {
        if (res.confirm) {
          submitFinishTiming(order)
        }
      },
    })
  }

  function handleEarlyFinish(order: Order, earlyMinutes: number) {
    if (!options.canWaiveOvertime.value) {
      uni.showToast({
        title: '请管理员确认后提前完成',
        icon: 'none',
      })
      return
    }

    const reasons = ['顾客提前离场', '设备问题', '老板批准', '其他']

    uni.showActionSheet({
      itemList: reasons,
      success: (res) => {
        const reason = reasons[res.tapIndex] || '其他'

        uni.showModal({
          title: '提前完成订单',
          content: `距离预计结束还有约 ${earlyMinutes} 分钟，确认提前完成吗？`,
          confirmText: '提前完成',
          confirmColor: '#c9472b',
          success: (modalRes) => {
            if (modalRes.confirm) {
              submitFinishTiming(order, {
                earlyFinishReason: reason,
              })
            }
          },
        })
      },
    })
  }

  function handleFinishWithCheckout(order: Order, overtimeMinutes: number, overtimeAmount: number) {
    uni.showModal({
      title: '结束并结算',
      content: `已超时 ${overtimeMinutes} 分钟，将产生补款 ${formatPrice(overtimeAmount)}。`,
      confirmText: '生成补款',
      confirmColor: '#1f6b56',
      success: (res) => {
        if (res.confirm) {
          submitFinishTiming(order)
        }
      },
    })
  }

  function handleWaiveOvertime(order: Order) {
    const reasons = ['顾客收杆延迟', '设备问题', '老板批准', '其他']

    uni.showActionSheet({
      itemList: reasons,
      success: (res) => {
        const reason = reasons[res.tapIndex] || '其他'

        submitFinishTiming(order, {
          waiveOvertime: true,
          waiverReason: reason,
        })
      },
    })
  }

  function handleFinishMeteredOrder(order: Order) {
    const checkout = getMeteredCheckout(order)

    if (!checkout) {
      uni.showToast({
        title: '订单缺少计费规则',
        icon: 'none',
      })
      return
    }

    uni.showModal({
      title: '结束并结算',
      content: `已计时 ${formatDuration(checkout.actualDurationMinutes)}，按 ${formatDuration(checkout.chargedMinutes)} 计费，需支付 ${formatPrice(checkout.amount)}。`,
      confirmText: '生成账单',
      confirmColor: '#1f6b56',
      success: (res) => {
        if (res.confirm) {
          submitFinishTiming(order)
        }
      },
    })
  }

  function handleFinishTiming(order: Order) {
    if (finishingOrderId.value || order.status !== 'in_progress') {
      return
    }

    if (order.orderType === 'metered') {
      handleFinishMeteredOrder(order)
      return
    }

    const overtimeMinutes = getOvertimeMinutes(order)
    const overtimeAmount = getOvertimeAmount(order, overtimeMinutes)
    const expectedEndedAt = getExpectedEndedAtTime(order)
    const earlyMinutes = expectedEndedAt > options.currentTime.value
      ? Math.ceil((expectedEndedAt - options.currentTime.value) / 60 / 1000)
      : 0

    if (earlyMinutes > 10) {
      handleEarlyFinish(order, earlyMinutes)
      return
    }

    if (overtimeMinutes > 0 && !getPackageOvertimeRule(order)) {
      uni.showToast({
        title: '订单缺少计费规则',
        icon: 'none',
      })
      return
    }

    if (overtimeAmount <= 0) {
      handleFinishWithoutOvertime(order)
      return
    }

    if (!options.canWaiveOvertime.value) {
      handleFinishWithCheckout(order, overtimeMinutes, overtimeAmount)
      return
    }

    uni.showActionSheet({
      itemList: ['生成补款', '免收并完成'],
      success: (res) => {
        if (res.tapIndex === 0) {
          handleFinishWithCheckout(order, overtimeMinutes, overtimeAmount)
          return
        }

        handleWaiveOvertime(order)
      },
    })
  }

  return {
    finishingOrderId,
    handleFinishTiming,
  }
}
