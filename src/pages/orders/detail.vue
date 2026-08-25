<script setup lang="ts">
import type { OrderDetailData, OrderStatus } from '@/api/types/order'
import qrcode from 'qrcode-generator'
import { cancelOrder, getOrderDetail } from '@/api/order'

definePage({
  style: {
    navigationBarTitleText: '订单详情',
  },
})

const loading = ref(false)
const cancelling = ref(false)
const errorText = ref('')
const orderDetail = ref<OrderDetailData>()
const orderId = ref('')
const currentTime = ref(Date.now())
let countdownTimer: ReturnType<typeof setInterval> | undefined

const statusTextMap: Record<OrderStatus, string> = {
  pending_payment: '待支付',
  paid: '待到店',
  checked_in: '已核销',
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
  checked_in: '已完成核销',
  in_progress: '',
  pending_checkout: '等待结账',
  completed: '订单已完成',
  cancelled: '预约已取消',
  refund_pending: '退款处理中',
  refunded: '订单已退款',
}
const checkinTipMap: Record<OrderStatus, string> = {
  pending_payment: '支付完成后会生成可用核销码。',
  paid: '到店后向服务员出示核销码，核销后开始计时。',
  checked_in: '订单已核销，服务员将为你开始计时。',
  in_progress: '当前正在计时，结束后由门店完成结账。',
  pending_checkout: '本次钓虾已结束，请按门店指引完成补款。',
  completed: '订单已完成，感谢到店体验。',
  cancelled: '该预约已取消，核销码不可用。',
  refund_pending: '订单退款处理中，核销码暂不可用。',
  refunded: '订单已退款，核销码不可用。',
}

const order = computed(() => orderDetail.value?.order)
const packageSnapshot = computed(() => order.value?.packageSnapshot)
const slotSnapshot = computed(() => order.value?.slotSnapshot)
const canCancel = computed(() => order.value ? ['pending_payment', 'paid'].includes(order.value.status) : false)
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
const countdownText = computed(() => {
  if (!expectedEndedAtTime.value) {
    return '-'
  }

  if (remainingMilliseconds.value <= 0) {
    return '已到预计结束时间'
  }

  return formatCountdown(remainingMilliseconds.value)
})

async function fetchOrderDetail() {
  if (!orderId.value) {
    errorText.value = '缺少订单 ID'
    return
  }

  loading.value = true
  errorText.value = ''

  try {
    orderDetail.value = await getOrderDetail(orderId.value)
  }
  catch (error) {
    errorText.value = error instanceof Error ? error.message : '订单详情获取失败'
  }
  finally {
    loading.value = false
  }
}

function getStatusText(status?: OrderStatus) {
  return status ? statusTextMap[status] || status : ''
}

function formatPrice(price?: number) {
  return `¥${((price || 0) / 100).toFixed(0)}`
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

function formatDateTime(value?: string | Date | number) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)

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

function startCountdownTimer() {
  if (countdownTimer) {
    return
  }

  currentTime.value = Date.now()
  countdownTimer = setInterval(() => {
    currentTime.value = Date.now()
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
        title: '核销码已复制',
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
    title: '取消预约',
    content: '核销前可以取消预约，取消后会释放该场次名额。',
    confirmText: '确认取消',
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
          title: '已取消预约',
          icon: 'success',
        })
        await fetchOrderDetail()
      }
      catch (error) {
        const title = error instanceof Error ? error.message : '取消预约失败'
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

onLoad((query) => {
  orderId.value = typeof query?.id === 'string' ? query.id : ''
  startCountdownTimer()
  fetchOrderDetail()
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

      <view v-if="canShowTimingCard" class="order-card timing-card timing-card--prominent">
        <view class="order-card__title">
          计时信息
        </view>
        <view v-if="order.status === 'in_progress'" class="timing-card__countdown">
          <view class="timing-card__label">
            剩余时间
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
        <view class="info-row">
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
        <view v-if="order.overtimeMinutes" class="info-row">
          <text class="info-row__label">
            超时时长
          </text>
          <text class="info-row__value">
            {{ formatDuration(order.overtimeMinutes) }}
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
      </view>

      <view class="order-card">
        <view class="order-card__title">
          预约信息
        </view>
        <view class="info-row">
          <text class="info-row__label">
            套餐
          </text>
          <text class="info-row__value">
            {{ packageSnapshot?.name || '套餐预约' }}
          </text>
        </view>
        <view class="info-row">
          <text class="info-row__label">
            预约方式
          </text>
          <text class="info-row__value">
            {{ slotSnapshot?.date ? '预约场次' : '到店安排' }}
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
        <view class="info-row">
          <text class="info-row__label">
            时长
          </text>
          <text class="info-row__value">
            {{ formatDuration(packageSnapshot?.durationMinutes) }}
          </text>
        </view>
        <view class="info-row">
          <text class="info-row__label">
            建议人数/杆数
          </text>
          <text class="info-row__value">
            {{ order.peopleCount }} 人 / {{ order.rodCount }} 根杆
          </text>
        </view>
      </view>

      <view class="order-card">
        <view class="order-card__header">
          <view class="order-card__title">
            到店核销
          </view>
          <view class="order-card__tag" :class="{ 'order-card__tag--disabled': !canShowCheckinCode }">
            {{ canShowCheckinCode ? '可核销' : '不可核销' }}
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
        v-if="canCancel"
        class="order-detail-page__cancel-btn"
        :disabled="cancelling"
        @click="handleCancelOrder"
      >
        取消预约
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
