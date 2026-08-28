<script setup lang="ts">
import type { Order, OrderDateValue, OrderDetailData, OrderStatus, PricingRuleSnapshot, RodSession } from '@/api/types/order'
import qrcode from 'qrcode-generator'
import { storeToRefs } from 'pinia'
import { requestNotificationSubscription } from '@/api/notification'
import { cancelOrder, getOrderDetail, payCheckoutOrder, payOrder, updateRodSession } from '@/api/order'
import type { NotificationTemplateKey } from '@/config/notificationTemplates'
import { activeOrderNotificationTemplateIds, activeOrderNotificationTemplateKeys, notificationTemplateKeys } from '@/config/notificationTemplates'
import { useFinishTimingOrder } from '@/hooks/useFinishTimingOrder'
import { useUserStore } from '@/store'

definePage({
  style: {
    navigationBarTitleText: '订单详情',
    enablePullDownRefresh: true,
  },
})

const loading = ref(false)
const cancelling = ref(false)
const payingOrder = ref(false)
const payingCheckout = ref(false)
const subscribingNotification = ref(false)
const operatingRodSessionId = ref('')
const notificationAuthorizationBlocked = ref(false)
const optimisticNotificationTemplateKeys = ref<NotificationTemplateKey[]>([])
const errorText = ref('')
const orderDetail = ref<OrderDetailData>()
const orderId = ref('')
const currentTime = ref(Date.now())
const paymentTimeoutRefreshing = ref(false)
const refreshedPaymentTimeoutOrderId = ref('')
let countdownTimer: ReturnType<typeof setInterval> | undefined
const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)

const statusTextMap: Record<OrderStatus, string> = {
  pending_payment: '待支付',
  paid: '待到店',
  checked_in: '已确认到店',
  in_progress: '进行中',
  pending_checkout: '待结账',
  completed: '已完成',
  cancelled: '已取消',
  refund_pending: '退款中',
  refunded: '已退款',
}
const orderTitleMap: Record<OrderStatus, string> = {
  pending_payment: '等待支付',
  paid: '预约成功',
  checked_in: '已确认到店',
  in_progress: '',
  pending_checkout: '等待结账',
  completed: '订单已完成',
  cancelled: '预约已取消',
  refund_pending: '退款处理中',
  refunded: '订单已退款',
}
const checkinTipMap: Record<OrderStatus, string> = {
  pending_payment: '支付完成后会生成开始计时码。',
  paid: '到店后向服务员出示开始计时码，确认后开始计时。',
  checked_in: '门店已确认到店，服务员将为你开始计时。',
  in_progress: '当前正在计时，结束后由门店完成结账。',
  pending_checkout: '本次钓虾已结束，请按门店指引完成补款。',
  completed: '订单已完成，感谢到店体验。',
  cancelled: '该预约已取消，开始计时码不可用。',
  refund_pending: '订单退款处理中，开始计时码暂不可用。',
  refunded: '订单已退款，开始计时码不可用。',
}

const order = computed(() => orderDetail.value?.order)
const packageSnapshot = computed(() => order.value?.packageSnapshot)
const pricingRuleSnapshot = computed(() => order.value?.pricingRuleSnapshot)
const activePricingRule = computed(() => orderDetail.value?.activePricingRule)
const activePricingRuleSnapshot = computed<PricingRuleSnapshot | undefined>(() => {
  if (!activePricingRule.value) {
    return undefined
  }

  const rule = activePricingRule.value
  const pricePerHour = Number(rule.pricePerHour || 0)
  const firstHourAmount = Number(rule.firstHourAmount || pricePerHour)
  const extraPricePerHour = Number(rule.extraPricePerHour || pricePerHour)

  return {
    pricingRuleId: rule._id,
    name: rule.name || '现场计时标准价',
    pricePerHour: pricePerHour > 0 ? pricePerHour : firstHourAmount,
    firstHourAmount,
    extraPricePerHour,
    minimumMinutes: rule.minimumMinutes || 0,
    unitMinutes: rule.unitMinutes || 60,
  }
})
const overtimePricingRule = computed(() => {
  const rule = pricingRuleSnapshot.value || activePricingRuleSnapshot.value

  if (!rule) {
    return null
  }

  const pricePerHour = Number(rule.pricePerHour || 0)
  const extraPricePerHour = Number(rule.extraPricePerHour || pricePerHour)
  const unitMinutes = Number(rule.unitMinutes || 60)

  if (extraPricePerHour <= 0 || unitMinutes <= 0) {
    return null
  }

  return {
    extraPricePerHour,
    unitMinutes,
  }
})
const slotSnapshot = computed(() => order.value?.slotSnapshot)
const canCancel = computed(() => order.value ? ['pending_payment', 'paid'].includes(order.value.status) : false)
const isRefundCancel = computed(() => order.value?.status === 'paid' && getRefundableAmount() > 0)
const cancelActionText = computed(() => isRefundCancel.value ? '申请退款' : '取消预约')
const cancelModalTitle = computed(() => isRefundCancel.value ? '申请退款' : '取消预约')
const cancelModalContent = computed(() => {
  if (isRefundCancel.value) {
    return `当前订单已支付且尚未核销，可申请退款 ${formatPrice(getRefundableAmount())}。确认后将模拟退款并关闭订单。`
  }

  return '当前订单尚未支付，取消后会关闭订单。'
})
const cancelSuccessText = computed(() => isRefundCancel.value ? '退款成功' : '已取消预约')
const canPayOrder = computed(() => order.value?.status === 'pending_payment')
const paymentExpiredAtTime = computed(() => getDateTimeValue(order.value?.paymentExpiredAt))
const paymentRemainingMilliseconds = computed(() => {
  if (!paymentExpiredAtTime.value) {
    return 0
  }

  return Math.max(paymentExpiredAtTime.value - currentTime.value, 0)
})
const paymentCountdownText = computed(() => {
  if (!paymentExpiredAtTime.value) {
    return '-'
  }

  if (paymentRemainingMilliseconds.value <= 0) {
    return '已超过支付时间'
  }

  return formatCountdown(paymentRemainingMilliseconds.value)
})
const canPayCheckout = computed(() => order.value?.status === 'pending_checkout' && Number(order.value.checkoutAmount || 0) > 0)
const canSubscribeOrderNotification = computed(() => !!order.value && !['completed', 'cancelled', 'refunded'].includes(order.value.status))
const requiredNotificationTemplateKeys = computed<NotificationTemplateKey[]>(() => activeOrderNotificationTemplateKeys)
const availableNotificationTemplateKeys = computed<NotificationTemplateKey[]>(() => {
  const customerStatus = orderDetail.value?.notificationStatus?.customer
  const sourceKeys = customerStatus?.hasAvailable
    ? customerStatus.templateKeys
    : optimisticNotificationTemplateKeys.value

  return sourceKeys.filter((templateKey): templateKey is NotificationTemplateKey => {
    return notificationTemplateKeys.includes(templateKey as NotificationTemplateKey)
  })
})
const missingNotificationTemplateKeys = computed(() => {
  return requiredNotificationTemplateKeys.value.filter(templateKey => !availableNotificationTemplateKeys.value.includes(templateKey))
})
const hasSubscribedOrderNotification = computed(() => {
  return canSubscribeOrderNotification.value && missingNotificationTemplateKeys.value.length === 0
})
const subscribeOrderNotificationText = computed(() => {
  if (subscribingNotification.value) {
    return '订阅中...'
  }

  if (hasSubscribedOrderNotification.value) {
    return '已订阅'
  }

  if (notificationAuthorizationBlocked.value) {
    return '去设置开启'
  }

  return '订阅订单提醒'
})
const canShowCheckinCode = computed(() => order.value?.status === 'paid' && !!order.value.checkinCode)
const checkinQrCodeUrl = computed(() => {
  if (!order.value?.checkinCode) {
    return ''
  }

  const qr = qrcode(0, 'M')
  qr.addData(JSON.stringify({
    type: 'shrimp_fishing_checkin',
    orderId: order.value._id,
    orderNo: order.value.orderNo,
    checkinCode: order.value.checkinCode,
  }))
  qr.make()

  return qr.createDataURL(8, 2)
})
const orderTitle = computed(() => {
  if (!order.value) {
    return ''
  }

  if (order.value.orderType === 'metered') {
    return order.value.status === 'in_progress' ? '现场开单计时中' : '现场开单'
  }

  return orderTitleMap[order.value.status] || '订单详情'
})
const checkinTip = computed(() => {
  if (!order.value) {
    return ''
  }

  return checkinTipMap[order.value.status] || '订单状态已更新，如需帮助请联系门店。'
})
const startedAtTime = computed(() => getDateTimeValue(order.value?.startedAt || order.value?.checkedInAt))
const endedAtTime = computed(() => getDateTimeValue(order.value?.endedAt || order.value?.finishedAt))
const expectedEndedAtTime = computed(() => {
  const savedExpectedEndedAt = getDateTimeValue(order.value?.expectedEndedAt)

  if (savedExpectedEndedAt) {
    return savedExpectedEndedAt
  }

  const durationMinutes = packageSnapshot.value?.durationMinutes || 0

  if (!startedAtTime.value || durationMinutes <= 0) {
    return 0
  }

  return startedAtTime.value + durationMinutes * 60 * 1000
})
const canShowTimingCard = computed(() => !!startedAtTime.value && ['in_progress', 'pending_checkout', 'completed'].includes(order.value?.status || ''))
const canManageTiming = computed(() => ['staff', 'admin', 'super_admin'].includes(userInfo.value.role || ''))
const canFinishTiming = computed(() => canManageTiming.value && order.value?.status === 'in_progress')
const canWaiveOvertime = computed(() => ['admin', 'super_admin'].includes(userInfo.value.role || ''))
const meteredRodSessions = computed<RodSession[]>(() => {
  if (order.value?.orderType !== 'metered') {
    return []
  }

  if (Array.isArray(order.value.rodSessions) && order.value.rodSessions.length) {
    return order.value.rodSessions
  }

  return Array.from({ length: Math.max(Math.floor(Number(order.value.rodCount || 1)), 1) }, (_, index) => ({
    id: `rod_${index + 1}`,
    label: `${index + 1}号杆`,
    status: order.value?.status === 'in_progress' ? 'in_progress' : 'pending',
    startedAt: order.value?.startedAt || order.value?.checkedInAt,
    paidAmount: getFirstHourAmount(),
  }))
})
const canShowRodSessions = computed(() => order.value?.orderType === 'metered' && meteredRodSessions.value.length > 0)
const remainingMilliseconds = computed(() => {
  if (!expectedEndedAtTime.value) {
    return 0
  }

  return Math.max(expectedEndedAtTime.value - currentTime.value, 0)
})
const actualDurationText = computed(() => {
  if (order.value?.actualDurationMinutes) {
    return formatDuration(order.value.actualDurationMinutes)
  }

  if (!startedAtTime.value) {
    return '-'
  }

  const endedAt = endedAtTime.value || currentTime.value
  const duration = Math.max(Math.ceil((endedAt - startedAtTime.value) / 60 / 1000), 0)

  return formatDuration(duration)
})
const actualElapsedMinutes = computed(() => {
  if (!startedAtTime.value) {
    return 0
  }

  const endedAt = endedAtTime.value || currentTime.value

  return Math.max(Math.ceil((endedAt - startedAtTime.value) / 60 / 1000), 0)
})
const overtimeElapsedMinutes = computed(() => {
  if (order.value?.orderType === 'metered' || !expectedEndedAtTime.value) {
    return 0
  }

  if (order.value?.overtimeMinutes) {
    return order.value.overtimeMinutes
  }

  const compareTime = endedAtTime.value || currentTime.value

  if (compareTime <= expectedEndedAtTime.value) {
    return 0
  }

  return Math.max(Math.ceil((compareTime - expectedEndedAtTime.value) / 60 / 1000), 0)
})
const overtimeAmountForDisplay = computed(() => {
  if (!overtimeElapsedMinutes.value) {
    return 0
  }

  const savedCheckoutAmount = Number(order.value?.checkoutAmount || 0)
  const savedOvertimeAmount = Number(order.value?.overtimeAmount || 0)

  if (savedCheckoutAmount > 0) {
    return savedCheckoutAmount
  }

  if (savedOvertimeAmount > 0) {
    return savedOvertimeAmount
  }

  if (!overtimePricingRule.value) {
    return 0
  }

  const chargedUnits = Math.ceil(overtimeElapsedMinutes.value / overtimePricingRule.value.unitMinutes)
  const chargedMinutes = chargedUnits * overtimePricingRule.value.unitMinutes

  return Math.ceil((chargedMinutes / 60) * overtimePricingRule.value.extraPricePerHour)
})
const overtimeAmountLabel = computed(() => {
  if (order.value?.status === 'in_progress') {
    return '预计补交费用'
  }

  return '应补交费用'
})
const countdownText = computed(() => {
  if (order.value?.orderType === 'metered') {
    return formatDuration(actualElapsedMinutes.value)
  }

  if (!expectedEndedAtTime.value) {
    return '-'
  }

  if (remainingMilliseconds.value <= 0) {
    return '已到预计结束时间'
  }

  return formatCountdown(remainingMilliseconds.value)
})
const checkoutTitle = computed(() => order.value?.orderType === 'metered' ? '待支付结算金额' : '待结账补款')
const checkoutDesc = computed(() => {
  if (order.value?.orderType === 'metered') {
    return '本次钓虾已结束，请支付结算金额，支付完成后订单将自动完成。'
  }

  return '本次超时产生补款，支付完成后订单将自动完成。'
})
const checkoutPayText = computed(() => order.value?.orderType === 'metered' ? '支付结算金额' : '支付补款')
const canShowMeteredSettlement = computed(() => !!order.value && ['pending_checkout', 'completed'].includes(order.value.status))
const { finishingOrderId, handleFinishTiming } = useFinishTimingOrder({
  currentTime,
  canWaiveOvertime,
  onSuccess: () => fetchOrderDetail(),
})

async function fetchOrderDetail(showLoading = true) {
  if (!orderId.value) {
    errorText.value = '缺少订单 ID'
    return false
  }

  if (showLoading) {
    loading.value = true
    errorText.value = ''
  }

  try {
    const detail = await getOrderDetail(orderId.value)
    orderDetail.value = detail
    syncOptimisticNotificationSubscription(detail)
    return true
  }
  catch (error) {
    if (showLoading) {
      errorText.value = error instanceof Error ? error.message : '订单详情获取失败'
    }

    return false
  }
  finally {
    if (showLoading) {
      loading.value = false
    }
  }
}

function isNotificationTemplateKey(value: string): value is NotificationTemplateKey {
  return notificationTemplateKeys.includes(value as NotificationTemplateKey)
}

function normalizeNotificationTemplateKeys(values: unknown) {
  return Array.isArray(values)
    ? values.filter((value): value is NotificationTemplateKey => typeof value === 'string' && isNotificationTemplateKey(value))
    : []
}

function markOptimisticNotificationSubscribed(templateKeys: NotificationTemplateKey[]) {
  optimisticNotificationTemplateKeys.value = Array.from(new Set([
    ...optimisticNotificationTemplateKeys.value,
    ...templateKeys,
  ]))
}

function syncOptimisticNotificationSubscription(detail: OrderDetailData) {
  const customerStatus = detail.notificationStatus?.customer

  if (!customerStatus) {
    return
  }

  if (customerStatus.hasAvailable) {
    optimisticNotificationTemplateKeys.value = normalizeNotificationTemplateKeys(customerStatus.templateKeys)
  }
  else {
    optimisticNotificationTemplateKeys.value = []
  }
}

async function refreshExpiredPaymentOrder() {
  if (!order.value || !canPayOrder.value || !paymentExpiredAtTime.value || paymentRemainingMilliseconds.value > 0) {
    return
  }

  if (paymentTimeoutRefreshing.value || refreshedPaymentTimeoutOrderId.value === order.value._id) {
    return
  }

  paymentTimeoutRefreshing.value = true

  try {
    const refreshed = await fetchOrderDetail(false)

    if (refreshed) {
      refreshedPaymentTimeoutOrderId.value = order.value?._id || ''
    }
  }
  finally {
    paymentTimeoutRefreshing.value = false
  }
}

function getStatusText(status?: OrderStatus) {
  if (order.value?.orderType === 'metered' && status === 'paid') {
    return '待开始'
  }

  return status ? statusTextMap[status] || status : ''
}

function formatPrice(price?: number) {
  return `¥${((price || 0) / 100).toFixed(0)}`
}

function getPaidAmount(orderData = order.value) {
  if (!orderData) {
    return 0
  }

  const paidAmount = Number(orderData.paidAmount || 0)

  if (paidAmount > 0) {
    return paidAmount
  }

  if (orderData.orderType !== 'metered' && ['paid', 'in_progress', 'pending_checkout', 'completed'].includes(orderData.status)) {
    return Math.max(Number(orderData.baseAmount || 0) - Number(orderData.discountAmount || 0), 0)
  }

  return 0
}

function getRefundableAmount(orderData = order.value) {
  if (!orderData) {
    return 0
  }

  return Math.max(
    Number(orderData.paidAmount || 0),
    Number(orderData.finalAmount || 0),
    Number(orderData.baseAmount || 0) - Number(orderData.discountAmount || 0),
  )
}

function getFirstHourAmount() {
  return pricingRuleSnapshot.value?.firstHourAmount || pricingRuleSnapshot.value?.pricePerHour || 0
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

function getDateTimeValue(value?: OrderDateValue | number) {
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

function formatDateTime(value?: OrderDateValue | number) {
  if (!value) {
    return '-'
  }

  const time = getDateTimeValue(value)

  if (!time) {
    return '-'
  }

  const date = new Date(time)

  if (Number.isNaN(date.getTime())) {
    return `${value}`
  }

  const pad = (num: number) => `${num}`.padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.ceil(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (num: number) => `${num}`.padStart(2, '0')

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

function getRodStatusText(session: RodSession) {
  const statusTextMap: Record<string, string> = {
    pending: '待开始',
    in_progress: '计时中',
    stopped: '已停杆',
    completed: '已完成',
  }

  return statusTextMap[session.status] || session.status
}

function getRodStatusClass(session: RodSession) {
  return {
    'rod-session__status--running': session.status === 'in_progress',
    'rod-session__status--stopped': session.status === 'stopped',
    'rod-session__status--completed': session.status === 'completed',
  }
}

function getRodDurationMinutes(session: RodSession) {
  if (session.actualDurationMinutes) {
    return session.actualDurationMinutes
  }

  if (Array.isArray(session.segments) && session.segments.length) {
    return session.segments.reduce((total, segment) => {
      const startedAt = getDateTimeValue(segment.startedAt)
      const stoppedAt = getDateTimeValue(segment.stoppedAt) || currentTime.value

      if (!startedAt || stoppedAt <= startedAt) {
        return total
      }

      return total + Math.ceil((stoppedAt - startedAt) / 60 / 1000)
    }, 0)
  }

  const startedAt = getDateTimeValue(session.startedAt || order.value?.startedAt || order.value?.checkedInAt)
  const endedAt = getDateTimeValue(session.stoppedAt || session.endedAt) || currentTime.value

  if (!startedAt || endedAt <= startedAt) {
    return 0
  }

  return Math.ceil((endedAt - startedAt) / 60 / 1000)
}

function getRodAmount(session: RodSession) {
  const rule = pricingRuleSnapshot.value
  const firstHourAmount = rule?.firstHourAmount || rule?.pricePerHour || 0
  const extraPricePerHour = rule?.extraPricePerHour || rule?.pricePerHour || 0
  const unitMinutes = rule?.unitMinutes || 60

  if (!firstHourAmount || !extraPricePerHour || unitMinutes <= 0) {
    return Math.max(Number(session.amount || 0), Number(session.paidAmount || 0), getFirstHourAmount())
  }

  const billableMinutes = Math.max(getRodDurationMinutes(session), rule?.minimumMinutes || 0)
  const extraMinutes = Math.max(billableMinutes - 60, 0)
  const chargedExtraMinutes = extraMinutes > 0
    ? Math.ceil(extraMinutes / unitMinutes) * unitMinutes
    : 0

  return firstHourAmount + Math.ceil((chargedExtraMinutes / 60) * extraPricePerHour)
}

function getRodCheckoutAmount(session: RodSession) {
  return Math.max(getRodAmount(session) - Number(session.paidAmount || getFirstHourAmount()), 0)
}

function canStopRodSession(session: RodSession) {
  return canManageTiming.value && order.value?.status === 'in_progress' && session.status === 'in_progress'
}

function canResumeRodSession(session: RodSession) {
  return canManageTiming.value && order.value?.status === 'in_progress' && ['stopped', 'completed'].includes(session.status)
}

function handleUpdateRodSession(session: RodSession, action: 'stop' | 'resume') {
  if (!order.value || operatingRodSessionId.value) {
    return
  }

  const actionText = action === 'stop' ? '停杆' : '续钟'

  uni.showModal({
    title: `${actionText}${session.label}`,
    content: action === 'stop'
      ? `确认停止 ${session.label} 计时吗？其他支杆不受影响。`
      : `确认让 ${session.label} 继续计时吗？系统会新增一段计时时间。`,
    confirmText: actionText,
    confirmColor: '#1f6b56',
    success: async (res) => {
      if (!res.confirm || !order.value) {
        return
      }

      operatingRodSessionId.value = session.id

      try {
        await updateRodSession({
          orderId: order.value._id,
          rodSessionId: session.id,
          action,
        })
        uni.showToast({
          title: `${actionText}成功`,
          icon: 'success',
        })
        await fetchOrderDetail(false)
      }
      catch (error) {
        uni.showToast({
          title: error instanceof Error ? error.message : `${actionText}失败`,
          icon: 'none',
        })
      }
      finally {
        operatingRodSessionId.value = ''
      }
    },
  })
}

function startCountdownTimer() {
  if (countdownTimer) {
    return
  }

  currentTime.value = Date.now()
  countdownTimer = setInterval(() => {
    currentTime.value = Date.now()
    void refreshExpiredPaymentOrder()
  }, 1000)
}

function stopCountdownTimer() {
  if (!countdownTimer) {
    return
  }

  clearInterval(countdownTimer)
  countdownTimer = undefined
}

function handleCopyCheckinCode() {
  if (!order.value?.checkinCode) {
    return
  }

  uni.setClipboardData({
    data: order.value.checkinCode,
    success: () => {
      uni.showToast({
        title: '开始计时码已复制',
        icon: 'success',
      })
    },
  })
}

function handleRetry() {
  fetchOrderDetail()
}

function handleBackHome() {
  uni.switchTab({
    url: '/pages/index/index',
  })
}

function handleCancelOrder() {
  if (!order.value || cancelling.value) {
    return
  }

  uni.showModal({
    title: cancelModalTitle.value,
    content: cancelModalContent.value,
    confirmText: isRefundCancel.value ? '确认退款' : '确认取消',
    confirmColor: '#c9472b',
    success: async (res) => {
      if (!res.confirm) {
        return
      }

      cancelling.value = true

      try {
        await cancelOrder({
          orderId: order.value?._id || '',
        })
        uni.showToast({
          title: cancelSuccessText.value,
          icon: 'success',
        })
        await fetchOrderDetail()
      }
      catch (error) {
        const title = error instanceof Error ? error.message : `${cancelActionText.value}失败`
        uni.showToast({
          title,
          icon: 'none',
        })
      }
      finally {
        cancelling.value = false
      }
    },
  })
}

function handlePayOrder() {
  if (!order.value || payingOrder.value || !canPayOrder.value) {
    return
  }

  const currentOrder = order.value

  uni.showModal({
    title: '模拟支付',
    content: `本次需支付 ${formatPrice(currentOrder.finalAmount || currentOrder.baseAmount)}，确认模拟支付吗？`,
    confirmText: '确认支付',
    confirmColor: '#1f6b56',
    success: async (res) => {
      if (!res.confirm) {
        return
      }

      payingOrder.value = true

      try {
        await payOrder({
          orderId: currentOrder._id,
        })
        uni.showToast({
          title: '支付成功',
          icon: 'success',
        })
        await fetchOrderDetail()
      }
      catch (error) {
        uni.showToast({
          title: error instanceof Error ? error.message : '订单支付失败',
          icon: 'none',
        })
      }
      finally {
        payingOrder.value = false
      }
    },
  })
}

function handleFinishCurrentOrder() {
  if (!order.value) {
    return
  }

  const orderForFinish: Order = order.value.pricingRuleSnapshot || !activePricingRuleSnapshot.value
    ? order.value
    : {
        ...order.value,
        pricingRuleId: activePricingRuleSnapshot.value.pricingRuleId,
        pricingRuleSnapshot: activePricingRuleSnapshot.value,
      }

  handleFinishTiming(orderForFinish)
}

function handlePayCheckout() {
  if (!order.value || payingCheckout.value || !canPayCheckout.value) {
    return
  }

  const currentOrder = order.value
  const paymentText = currentOrder.orderType === 'metered' ? '结算金额' : '补款'

  uni.showModal({
    title: currentOrder.orderType === 'metered' ? '支付结算金额' : '支付补款',
    content: `本次需支付${paymentText} ${formatPrice(currentOrder.checkoutAmount)}，确认支付吗？`,
    confirmText: '确认支付',
    confirmColor: '#1f6b56',
    success: async (res) => {
      if (!res.confirm) {
        return
      }

      payingCheckout.value = true

      try {
        await payCheckoutOrder({
          orderId: currentOrder._id,
        })
        uni.showToast({
          title: currentOrder.orderType === 'metered' ? '支付成功' : '补款成功',
          icon: 'success',
        })
        await fetchOrderDetail()
      }
      catch (error) {
        uni.showToast({
          title: error instanceof Error ? error.message : '支付补款失败',
          icon: 'none',
        })
      }
      finally {
        payingCheckout.value = false
      }
    },
  })
}

async function refreshNotificationAuthorizationStatus() {
  // #ifdef MP-WEIXIN
  try {
    const res = await wx.getSetting({
      withSubscriptions: true,
    })
    const subscriptionsSetting = res.subscriptionsSetting
    const itemSettings = subscriptionsSetting?.itemSettings || {}
    const hasBlockedTemplate = activeOrderNotificationTemplateIds.some((templateId) => {
      const status = itemSettings[templateId]

      return status === 'reject' || status === 'ban'
    })

    notificationAuthorizationBlocked.value = subscriptionsSetting?.mainSwitch === false || hasBlockedTemplate
  }
  catch {
    notificationAuthorizationBlocked.value = false
  }
  // #endif
}

async function openNotificationSetting() {
  // #ifdef MP-WEIXIN
  await wx.openSetting().catch(() => undefined)
  await refreshNotificationAuthorizationStatus()
  await fetchOrderDetail(false)
  // #endif
}

async function handleSubscribeOrderNotification() {
  if (subscribingNotification.value) {
    return
  }

  if (notificationAuthorizationBlocked.value) {
    await openNotificationSetting()
    return
  }

  subscribingNotification.value = true

  try {
    const res = await requestNotificationSubscription('customer', {
      orderId: orderId.value,
      templateKeys: missingNotificationTemplateKeys.value,
    })
    const acceptedTemplateKeys = normalizeNotificationTemplateKeys(res.acceptedTemplateKeys)
    const allMissingTemplatesAccepted = missingNotificationTemplateKeys.value.every(templateKey => acceptedTemplateKeys.includes(templateKey))

    uni.showToast({
      title: res.acceptedCount > 0 && allMissingTemplatesAccepted
        ? '订阅成功'
        : '仍有模板未订阅',
      icon: res.acceptedCount > 0 ? 'success' : 'none',
    })
    if (acceptedTemplateKeys.length && orderId.value) {
      markOptimisticNotificationSubscribed(acceptedTemplateKeys)
    }
    await fetchOrderDetail(false)
    await refreshNotificationAuthorizationStatus()
  }
  catch (error) {
    await refreshNotificationAuthorizationStatus()
    uni.showToast({
      title: error instanceof Error ? error.message : '订阅失败',
      icon: 'none',
    })
  }
  finally {
    subscribingNotification.value = false
  }
}

onLoad((query) => {
  orderId.value = typeof query?.id === 'string' ? query.id : ''
  optimisticNotificationTemplateKeys.value = []
  startCountdownTimer()
  refreshNotificationAuthorizationStatus()
  fetchOrderDetail()
})

onShow(() => {
  refreshNotificationAuthorizationStatus()
})

onPullDownRefresh(async () => {
  const refreshed = await fetchOrderDetail(false)

  uni.stopPullDownRefresh()

  if (!refreshed) {
    uni.showToast({
      title: '订单刷新失败',
      icon: 'none',
    })
  }
})

onUnload(() => {
  stopCountdownTimer()
})
</script>

<template>
  <view class="order-detail-page">
    <view v-if="loading" class="order-detail-page__placeholder">
      正在加载订单...
    </view>

    <view v-else-if="errorText" class="order-detail-page__error">
      <text>{{ errorText }}</text>
      <button class="order-detail-page__retry" @click="handleRetry">
        重试
      </button>
    </view>

    <view v-else-if="order" class="order-detail">
      <view class="order-detail__hero">
        <view class="order-detail__status">
          {{ getStatusText(order.status) }}
        </view>
        <view v-if="orderTitle" class="order-detail__title">
          {{ orderTitle }}
        </view>
        <view class="order-detail__order-no" :class="{ 'order-detail__order-no--primary': !orderTitle }">
          订单号：{{ order.orderNo }}
        </view>
      </view>

      <view v-if="canSubscribeOrderNotification" class="order-card notify-card">
        <view>
          <view class="notify-card__title">
            消息提醒
          </view>
          <view class="notify-card__desc">
            授权后可接收快到点、到点和订单状态提醒
          </view>
        </view>
        <button
          class="notify-card__btn"
          :class="{ 'notify-card__btn--disabled': hasSubscribedOrderNotification }"
          :disabled="subscribingNotification || hasSubscribedOrderNotification"
          @click="handleSubscribeOrderNotification"
        >
          {{ subscribeOrderNotificationText }}
        </button>
      </view>

      <view v-if="canPayOrder" class="order-card payment-card">
        <view class="order-card__title">
          支付信息
        </view>
        <view class="payment-card__countdown">
          <view class="payment-card__label">
            剩余支付时间
          </view>
          <view class="payment-card__value" :class="{ 'payment-card__value--expired': paymentRemainingMilliseconds <= 0 }">
            {{ paymentCountdownText }}
          </view>
        </view>
        <view class="info-row">
          <text class="info-row__label">
            支付截止
          </text>
          <text class="info-row__value">
            {{ formatDateTime(paymentExpiredAtTime) }}
          </text>
        </view>
        <view class="order-card__tip">
          超时未支付会自动关闭订单，需要重新预约。
        </view>
      </view>

      <view v-if="canShowTimingCard" class="order-card timing-card timing-card--prominent">
        <view class="order-card__title">
          计时信息
        </view>
        <view v-if="order.status === 'in_progress'" class="timing-card__countdown">
          <view class="timing-card__label">
            {{ order.orderType === 'metered' ? '已计时' : '剩余时间' }}
          </view>
          <view class="timing-card__value">
            {{ countdownText }}
          </view>
        </view>
        <view class="info-row">
          <text class="info-row__label">
            开始时间
          </text>
          <text class="info-row__value">
            {{ formatDateTime(startedAtTime) }}
          </text>
        </view>
        <view v-if="order.orderType !== 'metered'" class="info-row">
          <text class="info-row__label">
            预计结束
          </text>
          <text class="info-row__value">
            {{ formatDateTime(expectedEndedAtTime) }}
          </text>
        </view>
        <view v-if="endedAtTime" class="info-row">
          <text class="info-row__label">
            实际结束
          </text>
          <text class="info-row__value">
            {{ formatDateTime(endedAtTime) }}
          </text>
        </view>
        <view class="info-row">
          <text class="info-row__label">
            实际用时
          </text>
          <text class="info-row__value">
            {{ actualDurationText }}
          </text>
        </view>
        <view v-if="overtimeElapsedMinutes" class="info-row">
          <text class="info-row__label">
            超出用时
          </text>
          <text class="info-row__value">
            {{ formatDuration(overtimeElapsedMinutes) }}
          </text>
        </view>
        <view v-if="overtimeAmountForDisplay" class="info-row">
          <text class="info-row__label">
            {{ overtimeAmountLabel }}
          </text>
          <text class="info-row__price">
            {{ formatPrice(overtimeAmountForDisplay) }}
          </text>
        </view>
        <view v-if="order.earlyFinishedMinutes" class="info-row">
          <text class="info-row__label">
            提前完成
          </text>
          <text class="info-row__value">
            {{ formatDuration(order.earlyFinishedMinutes) }}
          </text>
        </view>
        <view v-if="order.earlyFinishReason" class="info-row">
          <text class="info-row__label">
            提前原因
          </text>
          <text class="info-row__value">
            {{ order.earlyFinishReason }}
          </text>
        </view>
        <view v-if="order.waivedOvertimeAmount" class="info-row">
          <text class="info-row__label">
            已免收
          </text>
          <text class="info-row__value">
            {{ formatPrice(order.waivedOvertimeAmount) }}
          </text>
        </view>
        <view v-if="canFinishTiming" class="timing-card__actions">
          <button
            class="timing-card__finish-btn"
            :disabled="!!finishingOrderId"
            @click="handleFinishCurrentOrder"
          >
            {{ finishingOrderId === order._id ? '处理中...' : '结束计时' }}
          </button>
        </view>
      </view>

      <view v-if="canShowRodSessions" class="order-card rod-session-card">
        <view class="order-card__title">
          杆位明细
        </view>
        <view class="rod-session-list">
          <view v-for="session in meteredRodSessions" :key="session.id" class="rod-session">
            <view class="rod-session__header">
              <view class="rod-session__name">
                {{ session.label }}
              </view>
              <view class="rod-session__status" :class="getRodStatusClass(session)">
                {{ getRodStatusText(session) }}
              </view>
            </view>
            <view class="rod-session__grid">
              <view>
                <view class="rod-session__label">
                  已用时
                </view>
                <view class="rod-session__value">
                  {{ formatDuration(getRodDurationMinutes(session)) }}
                </view>
              </view>
              <view>
                <view class="rod-session__label">
                  当前金额
                </view>
                <view class="rod-session__value rod-session__value--price">
                  {{ formatPrice(getRodAmount(session)) }}
                </view>
              </view>
              <view>
                <view class="rod-session__label">
                  待补
                </view>
                <view class="rod-session__value">
                  {{ formatPrice(getRodCheckoutAmount(session)) }}
                </view>
              </view>
            </view>
            <view v-if="session.startedAt" class="rod-session__time">
              开始 {{ formatDateTime(session.startedAt) }}
            </view>
            <view v-if="session.stoppedAt" class="rod-session__time">
              停杆 {{ formatDateTime(session.stoppedAt) }}
            </view>
            <view v-if="canStopRodSession(session) || canResumeRodSession(session)" class="rod-session__actions">
              <button
                v-if="canStopRodSession(session)"
                class="rod-session__btn"
                :disabled="operatingRodSessionId === session.id"
                @click="handleUpdateRodSession(session, 'stop')"
              >
                {{ operatingRodSessionId === session.id ? '处理中...' : '停杆' }}
              </button>
              <button
                v-if="canResumeRodSession(session)"
                class="rod-session__btn rod-session__btn--secondary"
                :disabled="operatingRodSessionId === session.id"
                @click="handleUpdateRodSession(session, 'resume')"
              >
                {{ operatingRodSessionId === session.id ? '处理中...' : '续钟' }}
              </button>
            </view>
          </view>
        </view>
      </view>

      <view v-if="canPayCheckout" class="order-card checkout-card">
        <view class="order-card__header">
          <view class="order-card__title">
            {{ checkoutTitle }}
          </view>
          <view class="order-card__tag order-card__tag--warning">
            待支付
          </view>
        </view>
        <view class="checkout-card__amount">
          {{ formatPrice(order.checkoutAmount) }}
        </view>
        <view class="checkout-card__desc">
          {{ checkoutDesc }}
        </view>
        <button
          class="checkout-card__pay-btn"
          :disabled="payingCheckout"
          @click="handlePayCheckout"
        >
          {{ payingCheckout ? '支付中...' : checkoutPayText }}
        </button>
      </view>

      <view class="order-card">
        <view class="order-card__title">
          {{ order.orderType === 'metered' ? '现场开单信息' : '预约信息' }}
        </view>
        <view class="info-row">
          <text class="info-row__label">
            {{ order.orderType === 'metered' ? '计费规则' : '套餐' }}
          </text>
          <text class="info-row__value">
            {{ order.orderType === 'metered' ? pricingRuleSnapshot?.name || '现场计时' : packageSnapshot?.name || '套餐预约' }}
          </text>
        </view>
        <view class="info-row">
          <text class="info-row__label">
            {{ order.orderType === 'metered' ? '开单方式' : '预约方式' }}
          </text>
          <text class="info-row__value">
            {{ order.orderType === 'metered' ? '现场开单' : slotSnapshot?.date ? '预约场次' : '到店安排' }}
          </text>
        </view>
        <view v-if="order.customerPhone" class="info-row">
          <text class="info-row__label">
            顾客手机号
          </text>
          <text class="info-row__value">
            {{ order.customerPhone }}
          </text>
        </view>
        <view v-if="slotSnapshot?.date" class="info-row">
          <text class="info-row__label">
            日期
          </text>
          <text class="info-row__value">
            {{ slotSnapshot.date }}
          </text>
        </view>
        <view v-if="slotSnapshot?.date" class="info-row">
          <text class="info-row__label">
            时间
          </text>
          <text class="info-row__value">
            {{ slotSnapshot?.startTime || '-' }}-{{ slotSnapshot?.endTime || '-' }}
          </text>
        </view>
        <view v-if="order.orderType !== 'metered'" class="info-row">
          <text class="info-row__label">
            时长
          </text>
          <text class="info-row__value">
            {{ formatDuration(packageSnapshot?.durationMinutes) }}
          </text>
        </view>
        <view v-if="order.orderType !== 'metered'" class="info-row">
          <text class="info-row__label">
            杆数
          </text>
          <text class="info-row__value">
            {{ order.rodCount }} 支杆
          </text>
        </view>
        <template v-if="order.orderType === 'metered'">
          <view class="info-row">
            <text class="info-row__label">
              杆数
            </text>
            <text class="info-row__value">
              {{ order.rodCount }} 支杆
            </text>
          </view>
          <view v-if="order.paidAmount" class="info-row">
            <text class="info-row__label">
              已预付首小时
            </text>
            <text class="info-row__value">
              {{ formatPrice(order.paidAmount) }}
            </text>
          </view>
          <view class="info-row">
            <text class="info-row__label">
              首小时价格
            </text>
            <text class="info-row__value">
              {{ formatPrice(pricingRuleSnapshot?.firstHourAmount || pricingRuleSnapshot?.pricePerHour) }}
            </text>
          </view>
          <view v-if="order.orderType === 'metered'" class="info-row">
            <text class="info-row__label">
              续钟单价
            </text>
            <text class="info-row__value">
              {{ formatPrice(pricingRuleSnapshot?.extraPricePerHour || pricingRuleSnapshot?.pricePerHour) }}/小时
            </text>
          </view>
          <view class="info-row">
            <text class="info-row__label">
              最低计费
            </text>
            <text class="info-row__value">
              {{ formatDuration(pricingRuleSnapshot?.minimumMinutes) }}
            </text>
          </view>
          <view class="info-row">
            <text class="info-row__label">
              计费粒度
            </text>
            <text class="info-row__value">
              {{ formatDuration(pricingRuleSnapshot?.unitMinutes) }}
            </text>
          </view>
          <view v-if="order.chargedMeteredMinutes" class="info-row">
            <text class="info-row__label">
              结算时长
            </text>
            <text class="info-row__value">
              {{ formatDuration(order.chargedMeteredMinutes) }}
            </text>
          </view>
        </template>
      </view>

      <view class="order-card">
        <view class="order-card__header">
          <view class="order-card__title">
            到店开始计时
          </view>
          <view class="order-card__tag" :class="{ 'order-card__tag--disabled': !canShowCheckinCode }">
            {{ canShowCheckinCode ? '可开始' : '不可开始' }}
          </view>
        </view>
        <view v-if="canShowCheckinCode" class="checkin-code">
          <image class="checkin-code__qr" :src="checkinQrCodeUrl" mode="aspectFit" />
          <view class="checkin-code__value">
            {{ order.checkinCode }}
          </view>
          <button class="checkin-code__copy" @click="handleCopyCheckinCode">
            复制号码
          </button>
        </view>
        <view v-else class="checkin-code checkin-code--disabled">
          <view class="checkin-code__value">
            {{ order.checkinCode || '------' }}
          </view>
          <view class="checkin-code__action">
            {{ getStatusText(order.status) }}
          </view>
        </view>
        <view class="order-card__tip">
          {{ checkinTip }}
        </view>
      </view>

      <view class="order-card">
        <view class="order-card__title">
          费用明细
        </view>
        <template v-if="order.orderType === 'metered'">
          <view v-if="order.actualDurationMinutes" class="info-row">
            <text class="info-row__label">
              实际计时
            </text>
            <text class="info-row__value">
              {{ formatDuration(order.actualDurationMinutes) }}
            </text>
          </view>
          <view v-if="order.chargedMeteredMinutes" class="info-row">
            <text class="info-row__label">
              结算时长
            </text>
            <text class="info-row__value">
              {{ formatDuration(order.chargedMeteredMinutes) }}
            </text>
          </view>
          <view v-if="canShowMeteredSettlement" class="info-row">
            <text class="info-row__label">
              现场计时金额
            </text>
            <text class="info-row__price">
              {{ formatPrice(order.finalAmount) }}
            </text>
          </view>
          <view v-else class="info-row">
            <text class="info-row__label">
              结算金额
            </text>
            <text class="info-row__value">
              结束计时后生成
            </text>
          </view>
          <view v-if="order.checkoutAmount" class="info-row">
            <text class="info-row__label">
              待支付
            </text>
            <text class="info-row__price">
              {{ formatPrice(order.checkoutAmount) }}
            </text>
          </view>
          <view v-if="order.checkoutPaidAmount" class="info-row">
            <text class="info-row__label">
              已支付结算
            </text>
            <text class="info-row__value">
              {{ formatPrice(order.checkoutPaidAmount) }}
            </text>
          </view>
          <view v-if="order.checkoutPaidAt" class="info-row">
            <text class="info-row__label">
              支付时间
            </text>
            <text class="info-row__value">
              {{ formatDateTime(order.checkoutPaidAt) }}
            </text>
          </view>
        </template>
        <template v-else>
          <view class="info-row">
            <text class="info-row__label">
              套餐金额
            </text>
            <text class="info-row__value">
              {{ formatPrice(order.baseAmount) }}
            </text>
          </view>
          <view v-if="order.discountAmount" class="info-row">
            <text class="info-row__label">
              优惠金额
            </text>
            <text class="info-row__value">
              -{{ formatPrice(order.discountAmount) }}
            </text>
          </view>
          <view v-if="order.overtimeAmount" class="info-row">
            <text class="info-row__label">
              超时金额
            </text>
            <text class="info-row__value">
              {{ formatPrice(order.overtimeAmount) }}
            </text>
          </view>
          <view v-if="order.checkoutAmount" class="info-row">
            <text class="info-row__label">
              待补款
            </text>
            <text class="info-row__price">
              {{ formatPrice(order.checkoutAmount) }}
            </text>
          </view>
          <view v-if="order.checkoutPaidAmount" class="info-row">
            <text class="info-row__label">
              已补款
            </text>
            <text class="info-row__value">
              {{ formatPrice(order.checkoutPaidAmount) }}
            </text>
          </view>
          <view v-if="order.checkoutPaidAt" class="info-row">
            <text class="info-row__label">
              补款时间
            </text>
            <text class="info-row__value">
              {{ formatDateTime(order.checkoutPaidAt) }}
            </text>
          </view>
        </template>
        <template v-if="order.refundAmount || order.refundedAt || order.refundNo">
          <view v-if="order.refundAmount" class="info-row">
            <text class="info-row__label">
              退款金额
            </text>
            <text class="info-row__price">
              {{ formatPrice(order.refundAmount) }}
            </text>
          </view>
          <view v-if="order.refundedAt" class="info-row">
            <text class="info-row__label">
              退款时间
            </text>
            <text class="info-row__value">
              {{ formatDateTime(order.refundedAt) }}
            </text>
          </view>
          <view v-if="order.refundNo" class="info-row">
            <text class="info-row__label">
              退款单号
            </text>
            <text class="info-row__value">
              {{ order.refundNo }}
            </text>
          </view>
        </template>
        <view class="info-row">
          <text class="info-row__label">
            已支付
          </text>
          <text class="info-row__value">
            {{ formatPrice(getPaidAmount(order)) }}
          </text>
        </view>
        <view v-if="order.adjustAmount" class="info-row">
          <text class="info-row__label">
            调整金额
          </text>
          <text class="info-row__value">
            {{ formatPrice(order.adjustAmount) }}
          </text>
        </view>
        <view v-if="order.goodsAmount" class="info-row">
          <text class="info-row__label">
            商品金额
          </text>
          <text class="info-row__value">
            {{ formatPrice(order.goodsAmount) }}
          </text>
        </view>
        <view class="info-row">
          <text class="info-row__label">
            最终金额
          </text>
          <text class="info-row__price">
            {{ formatPrice(order.finalAmount) }}
          </text>
        </view>
      </view>

      <button class="order-detail-page__home-btn" @click="handleBackHome">
        返回首页
      </button>
      <button
        v-if="canPayOrder"
        class="order-detail-page__pay-btn"
        :disabled="payingOrder"
        @click="handlePayOrder"
      >
        {{ payingOrder ? '支付中...' : '模拟支付' }}
      </button>
      <button
        v-if="canCancel"
        class="order-detail-page__cancel-btn"
        :disabled="cancelling"
        @click="handleCancelOrder"
      >
        {{ cancelling ? '处理中...' : cancelActionText }}
      </button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.order-detail-page {
  min-height: 100vh;
  background: #f4f7f2;
  padding: 28rpx;
  color: #17211d;

  &__placeholder,
  &__error {
    border-radius: 8rpx;
    background: #ffffff;
    padding: 44rpx 28rpx;
    color: #718079;
    font-size: 26rpx;
    text-align: center;
  }

  &__retry,
  &__home-btn,
  &__pay-btn,
  &__cancel-btn {
    min-height: 76rpx;
    border-radius: 8rpx;
    font-size: 28rpx;
    line-height: 76rpx;
  }

  &__retry {
    width: 180rpx;
    margin-top: 24rpx;
    background: #1f6b56;
    color: #ffffff;
  }

  &__home-btn {
    margin-top: 28rpx;
    background: #1f6b56;
    color: #ffffff;
  }

  &__pay-btn {
    margin-top: 18rpx;
    background: #f6c453;
    color: #20312b;
    font-weight: 700;
  }

  &__cancel-btn {
    margin-top: 18rpx;
    border: 2rpx solid #e8d0c7;
    background: #ffffff;
    color: #c9472b;
  }
}

.order-detail {
  &__hero {
    border-radius: 8rpx;
    background: #163b32;
    padding: 36rpx 28rpx;
  }

  &__status {
    width: fit-content;
    border-radius: 8rpx;
    background: #f6c453;
    padding: 8rpx 16rpx;
    color: #20312b;
    font-size: 24rpx;
    line-height: 1.2;
  }

  &__title {
    margin-top: 28rpx;
    color: #ffffff;
    font-size: 44rpx;
    font-weight: 700;
    line-height: 1.2;
  }

  &__order-no {
    margin-top: 14rpx;
    color: #f5ead8;
    font-size: 24rpx;
    line-height: 1.4;

    &--primary {
      margin-top: 28rpx;
      color: #ffffff;
      font-size: 34rpx;
      font-weight: 700;
    }
  }
}

.order-card {
  margin-top: 24rpx;
  border-radius: 8rpx;
  background: #ffffff;
  padding: 28rpx;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);

  &__title {
    margin-bottom: 18rpx;
    color: #17211d;
    font-size: 32rpx;
    font-weight: 700;
    line-height: 1.25;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20rpx;
    margin-bottom: 18rpx;

    .order-card__title {
      margin-bottom: 0;
    }
  }

  &__tag {
    flex-shrink: 0;
    border-radius: 8rpx;
    background: #e8f3ed;
    padding: 8rpx 14rpx;
    color: #1f6b56;
    font-size: 22rpx;
    line-height: 1.2;

    &--disabled {
      background: #f0f2ef;
      color: #89938f;
    }

    &--warning {
      background: #f8f2df;
      color: #c9472b;
    }
  }

  &__tip {
    margin-top: 18rpx;
    color: #718079;
    font-size: 24rpx;
    line-height: 1.5;
    text-align: center;
  }
}

.info-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  padding: 16rpx 0;
  border-bottom: 2rpx solid #eef2ef;

  &:last-child {
    border-bottom: none;
  }

  &__label {
    flex-shrink: 0;
    color: #718079;
    font-size: 26rpx;
    line-height: 1.4;
  }

  &__value,
  &__price {
    min-width: 0;
    color: #17211d;
    font-size: 26rpx;
    line-height: 1.4;
    text-align: right;
  }

  &__price {
    color: #c9472b;
    font-size: 32rpx;
    font-weight: 700;
  }
}

.checkout-card {
  &__amount {
    color: #c9472b;
    font-size: 56rpx;
    font-weight: 700;
    line-height: 1.15;
  }

  &__desc {
    margin-top: 12rpx;
    color: #718079;
    font-size: 25rpx;
    line-height: 1.5;
  }

  &__pay-btn {
    min-height: 78rpx;
    margin-top: 24rpx;
    border-radius: 8rpx;
    background: #1f6b56;
    color: #ffffff;
    font-size: 28rpx;
    font-weight: 600;
    line-height: 78rpx;
  }
}

.notify-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;

  &__title {
    color: #17352f;
    font-size: 29rpx;
    font-weight: 700;
    line-height: 1.3;
  }

  &__desc {
    margin-top: 8rpx;
    color: #718079;
    font-size: 23rpx;
    line-height: 1.4;
  }

  &__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 220rpx;
    min-height: 62rpx;
    margin: 0;
    border-radius: 8rpx;
    background: #1f6b56;
    color: #ffffff;
    font-size: 24rpx;
    line-height: 62rpx;
    white-space: nowrap;

    &--disabled {
      background: #dfe8e3;
      color: #718079;
    }
  }
}

.payment-card {
  &__countdown {
    border-radius: 8rpx;
    background: #f8f2df;
    padding: 24rpx 20rpx;
    margin-bottom: 12rpx;
    text-align: center;
  }

  &__label {
    color: #718079;
    font-size: 24rpx;
    line-height: 1.3;
  }

  &__value {
    margin-top: 10rpx;
    color: #c9472b;
    font-size: 50rpx;
    font-weight: 700;
    line-height: 1.15;

    &--expired {
      font-size: 38rpx;
    }
  }
}

.timing-card {
  &--prominent {
    margin-top: 24rpx;
  }

  &__countdown {
    border-radius: 8rpx;
    background: #f8f2df;
    padding: 24rpx 20rpx;
    margin-bottom: 12rpx;
    text-align: center;
  }

  &__label {
    color: #718079;
    font-size: 24rpx;
    line-height: 1.3;
  }

  &__value {
    margin-top: 10rpx;
    color: #c9472b;
    font-size: 56rpx;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.15;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 20rpx;
  }

  &__finish-btn {
    width: 220rpx;
    min-height: 68rpx;
    margin: 0;
    border-radius: 8rpx;
    background: #1f6b56;
    color: #ffffff;
    font-size: 26rpx;
    font-weight: 600;
    line-height: 68rpx;
  }
}

.rod-session-card {
  .order-card__title {
    margin-bottom: 20rpx;
  }
}

.rod-session-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.rod-session {
  border: 2rpx solid #e5eee9;
  border-radius: 8rpx;
  background: #fbfcfb;
  padding: 22rpx;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18rpx;
  }

  &__name {
    color: #17211d;
    font-size: 30rpx;
    font-weight: 700;
    line-height: 1.3;
  }

  &__status {
    flex-shrink: 0;
    border-radius: 8rpx;
    background: #f0f2ef;
    padding: 7rpx 13rpx;
    color: #718079;
    font-size: 22rpx;
    line-height: 1.2;

    &--running {
      background: #fff7df;
      color: #c9472b;
    }

    &--stopped {
      background: #e8f3ed;
      color: #1f6b56;
    }

    &--completed {
      background: #f0f2ef;
      color: #718079;
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14rpx;
    margin-top: 20rpx;
  }

  &__label {
    color: #718079;
    font-size: 22rpx;
    line-height: 1.3;
  }

  &__value {
    margin-top: 8rpx;
    color: #17211d;
    font-size: 25rpx;
    font-weight: 700;
    line-height: 1.3;

    &--price {
      color: #c9472b;
    }
  }

  &__time {
    margin-top: 14rpx;
    color: #718079;
    font-size: 23rpx;
    line-height: 1.4;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 16rpx;
    margin-top: 20rpx;
  }

  &__btn {
    width: 160rpx;
    min-height: 62rpx;
    margin: 0;
    border-radius: 8rpx;
    background: #1f6b56;
    color: #ffffff;
    font-size: 25rpx;
    font-weight: 600;
    line-height: 62rpx;

    &--secondary {
      background: #f6c453;
      color: #20312b;
    }
  }
}

.checkin-code {
  border-radius: 8rpx;
  background: #f8f2df;
  padding: 28rpx 20rpx 24rpx;
  color: #17211d;
  font-weight: 700;
  text-align: center;

  &--disabled {
    background: #f0f2ef;
    color: #89938f;
  }

  &__qr {
    width: 320rpx;
    height: 320rpx;
    border: 12rpx solid #ffffff;
    border-radius: 8rpx;
    background: #ffffff;
  }

  &__value {
    margin-top: 18rpx;
    font-size: 56rpx;
    letter-spacing: 8rpx;
    line-height: 1.2;
  }

  &__action {
    margin-top: 14rpx;
    color: #718079;
    font-size: 22rpx;
    font-weight: 400;
    letter-spacing: 0;
    line-height: 1.3;
  }

  &__copy {
    width: 220rpx;
    min-height: 64rpx;
    margin-top: 20rpx;
    border-radius: 8rpx;
    background: #1f6b56;
    color: #ffffff;
    font-size: 26rpx;
    line-height: 64rpx;
  }
}

button::after {
  border: none;
}

button[disabled] {
  opacity: 0.6;
}
</style>
