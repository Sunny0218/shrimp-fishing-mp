import type { Ref } from 'vue'
import { ref } from 'vue'
import type { Order } from '@/api/types/order'
import { finishTimingOrder } from '@/api/order'

interface FinishTimingOptions {
  currentTime: Ref<number>
  canWaiveOvertime: Ref<boolean>
  onSuccess?: (order: Order) => Promise<void> | void
}

export function useFinishTimingOrder(options: FinishTimingOptions) {
  const finishingOrderId = ref('')

  function getDateTimeValue(value?: string | Date) {
    if (!value) {
      return 0
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? 0 : value.getTime()
    }

    const time = new Date(value).getTime()

    return Number.isNaN(time) ? 0 : time
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

  function getOvertimeAmount(overtimeMinutes: number) {
    if (overtimeMinutes <= 0) {
      return 0
    }

    return Math.ceil(overtimeMinutes / 30) * 3000
  }

  function formatPrice(price?: number) {
    return `¥${((price || 0) / 100).toFixed(0)}`
  }

  async function submitFinishTiming(
    order: Order,
    payload: { waiveOvertime?: boolean, waiverReason?: string, earlyFinishReason?: string } = {},
  ) {
    finishingOrderId.value = order._id
    console.info('[finishTimingOrder] submit:', {
      orderId: order._id,
      waiveOvertime: !!payload.waiveOvertime,
      waiverReason: payload.waiverReason || '',
      earlyFinishReason: payload.earlyFinishReason || '',
    })

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

  function handleFinishTiming(order: Order) {
    if (finishingOrderId.value || order.status !== 'in_progress') {
      return
    }

    const overtimeMinutes = getOvertimeMinutes(order)
    const overtimeAmount = getOvertimeAmount(overtimeMinutes)
    const expectedEndedAt = getExpectedEndedAtTime(order)
    const earlyMinutes = expectedEndedAt > options.currentTime.value
      ? Math.ceil((expectedEndedAt - options.currentTime.value) / 60 / 1000)
      : 0

    if (earlyMinutes > 10) {
      handleEarlyFinish(order, earlyMinutes)
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
