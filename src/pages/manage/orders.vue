<script setup lang="ts">
import type { ManageOrderStatusFilter, Order, OrderStatus, TodayOrdersData } from '@/api/types/order'
import { getTodayOrders } from '@/api/order'

definePage({
  style: {
    navigationBarTitleText: '今日订单',
    enablePullDownRefresh: true,
  },
})

interface StatusTab {
  label: string
  value: ManageOrderStatusFilter
}

const statusTabs: StatusTab[] = [
  { label: '处理中', value: 'active' },
  { label: '待核销', value: 'paid' },
  { label: '进行中', value: 'in_progress' },
  { label: '待结账', value: 'pending_checkout' },
  { label: '全部', value: 'all' },
]
const statusTextMap: Record<OrderStatus, string> = {
  pending_payment: '待支付',
  paid: '待核销',
  checked_in: '已核销',
  in_progress: '进行中',
  pending_checkout: '待结账',
  completed: '已完成',
  cancelled: '已取消',
  refund_pending: '退款中',
  refunded: '已退款',
}

const loading = ref(false)
const errorText = ref('')
const activeStatus = ref<ManageOrderStatusFilter>('active')
const todayOrders = ref<TodayOrdersData>()
const currentTime = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

const orderList = computed(() => todayOrders.value?.rows || [])
const summary = computed(() => todayOrders.value?.summary)
const currentDate = computed(() => todayOrders.value?.date || getLocalDateText())

async function fetchOrders() {
  loading.value = true
  errorText.value = ''

  try {
    todayOrders.value = await getTodayOrders({
      status: activeStatus.value,
    })
  }
  catch (error) {
    errorText.value = error instanceof Error ? error.message : '今日订单获取失败'
  }
  finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

function handleChangeStatus(status: ManageOrderStatusFilter) {
  if (activeStatus.value === status) {
    return
  }

  activeStatus.value = status
  fetchOrders()
}

function handleViewDetail(order: Order) {
  uni.navigateTo({
    url: `/pages/orders/detail?id=${order._id}`,
  })
}

function getLocalDateText() {
  const date = new Date()
  const pad = (num: number) => `${num}`.padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.ceil(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (num: number) => `${num}`.padStart(2, '0')

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

function getTimingText(order: Order) {
  if (order.status !== 'in_progress') {
    return ''
  }

  const expectedEndedAt = getExpectedEndedAtTime(order)

  if (!expectedEndedAt) {
    return '计时中'
  }

  const rest = expectedEndedAt - currentTime.value

  if (rest <= 0) {
    return '已超时'
  }

  return `剩余 ${formatCountdown(rest)}`
}

function getStatusText(status: OrderStatus) {
  return statusTextMap[status] || status
}

function getOrderTitle(order: Order) {
  return order.packageSnapshot?.name || '套餐订单'
}

function getOrderTime(order: Order) {
  if (order.status === 'in_progress') {
    const startedAt = getDateTimeValue(order.startedAt || order.checkedInAt)
    const expectedEndedAt = getExpectedEndedAtTime(order)

    if (startedAt && expectedEndedAt) {
      return `${formatTime(startedAt)}-${formatTime(expectedEndedAt)}`
    }
  }

  if (order.slotSnapshot?.date) {
    return `${order.slotSnapshot.date} ${order.slotSnapshot.startTime}-${order.slotSnapshot.endTime}`
  }

  return `下单 ${formatDateTime(order.createdAt)}`
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

  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatTime(value?: string | Date | number) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  const pad = (num: number) => `${num}`.padStart(2, '0')

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatPrice(price?: number) {
  return `¥${((price || 0) / 100).toFixed(0)}`
}

function startTimer() {
  if (timer) {
    return
  }

  currentTime.value = Date.now()
  timer = setInterval(() => {
    currentTime.value = Date.now()
  }, 1000)
}

function stopTimer() {
  if (!timer) {
    return
  }

  clearInterval(timer)
  timer = undefined
}

onLoad(() => {
  startTimer()
  fetchOrders()
})

onShow(() => {
  if (todayOrders.value) {
    fetchOrders()
  }
})

onPullDownRefresh(() => {
  fetchOrders()
})

onUnload(() => {
  stopTimer()
})
</script>

<template>
  <view class="today-orders-page">
    <view class="summary-bar">
      <view class="summary-bar__date">
        {{ currentDate }}
      </view>
      <view class="summary-grid">
        <view class="summary-item">
          <view class="summary-item__value">
            {{ summary?.active || 0 }}
          </view>
          <view class="summary-item__label">
            处理中
          </view>
        </view>
        <view class="summary-item">
          <view class="summary-item__value">
            {{ summary?.paid || 0 }}
          </view>
          <view class="summary-item__label">
            待核销
          </view>
        </view>
        <view class="summary-item">
          <view class="summary-item__value">
            {{ summary?.inProgress || 0 }}
          </view>
          <view class="summary-item__label">
            进行中
          </view>
        </view>
        <view class="summary-item">
          <view class="summary-item__value">
            {{ summary?.pendingCheckout || 0 }}
          </view>
          <view class="summary-item__label">
            待结账
          </view>
        </view>
      </view>
    </view>

    <view class="today-orders-page__tabs">
      <view
        v-for="tab in statusTabs"
        :key="tab.value"
        class="today-orders-page__tab"
        :class="{ 'today-orders-page__tab--active': activeStatus === tab.value }"
        @click="handleChangeStatus(tab.value)"
      >
        {{ tab.label }}
      </view>
    </view>

    <view v-if="loading" class="today-orders-page__placeholder">
      正在加载今日订单...
    </view>

    <view v-else-if="errorText" class="today-orders-page__error">
      <text>{{ errorText }}</text>
      <button class="today-orders-page__retry" @click="fetchOrders">
        重试
      </button>
    </view>

    <view v-else-if="!orderList.length" class="today-orders-page__placeholder">
      暂无订单
    </view>

    <view v-else class="order-list">
      <view
        v-for="order in orderList"
        :key="order._id"
        class="order-card"
        @click="handleViewDetail(order)"
      >
        <view class="order-card__header">
          <view class="order-card__title">
            {{ getOrderTitle(order) }}
          </view>
          <view class="order-card__status" :class="`order-card__status--${order.status}`">
            {{ getStatusText(order.status) }}
          </view>
        </view>

        <view class="order-card__line">
          {{ getOrderTime(order) }}
        </view>

        <view v-if="getTimingText(order)" class="order-card__timer" :class="{ 'order-card__timer--overtime': getTimingText(order) === '已超时' }">
          {{ getTimingText(order) }}
        </view>

        <view class="order-card__meta">
          {{ order.peopleCount }} 人 / {{ order.rodCount }} 根杆
        </view>

        <view class="order-card__footer">
          <text class="order-card__no">
            {{ order.orderNo }}
          </text>
          <text class="order-card__price">
            {{ formatPrice(order.finalAmount) }}
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.today-orders-page {
  min-height: 100vh;
  background: #f4f7f2;
  padding: 24rpx 28rpx 40rpx;
  color: #17211d;

  &__tabs {
    display: flex;
    gap: 14rpx;
    overflow-x: auto;
    padding: 22rpx 0 18rpx;
    white-space: nowrap;
  }

  &__tab {
    flex-shrink: 0;
    border-radius: 8rpx;
    background: #ffffff;
    padding: 14rpx 22rpx;
    color: #62716b;
    font-size: 25rpx;
    line-height: 1.2;

    &--active {
      background: #1f6b56;
      color: #ffffff;
      font-weight: 600;
    }
  }

  &__placeholder,
  &__error {
    border-radius: 8rpx;
    background: #ffffff;
    padding: 44rpx 28rpx;
    color: #718079;
    font-size: 26rpx;
    text-align: center;
  }

  &__retry {
    width: 180rpx;
    min-height: 70rpx;
    margin-top: 24rpx;
    border-radius: 8rpx;
    background: #1f6b56;
    color: #ffffff;
    font-size: 26rpx;
    line-height: 70rpx;
  }
}

.summary-bar {
  border-radius: 8rpx;
  background: #163b32;
  padding: 28rpx;

  &__date {
    color: #f5ead8;
    font-size: 26rpx;
    line-height: 1.3;
  }
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16rpx;
  margin-top: 24rpx;
}

.summary-item {
  min-width: 0;

  &__value {
    color: #ffffff;
    font-size: 40rpx;
    font-weight: 700;
    line-height: 1.1;
    text-align: center;
  }

  &__label {
    margin-top: 8rpx;
    color: #cfe2d8;
    font-size: 22rpx;
    line-height: 1.2;
    text-align: center;
  }
}

.order-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.order-card {
  border-radius: 8rpx;
  background: #ffffff;
  padding: 26rpx;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);

  &__header,
  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20rpx;
  }

  &__title {
    min-width: 0;
    color: #17211d;
    font-size: 31rpx;
    font-weight: 700;
    line-height: 1.3;
  }

  &__status {
    flex-shrink: 0;
    border-radius: 8rpx;
    background: #e8f3ed;
    padding: 8rpx 14rpx;
    color: #1f6b56;
    font-size: 22rpx;
    line-height: 1.2;

    &--in_progress {
      background: #f8f2df;
      color: #c9472b;
    }

    &--pending_checkout {
      background: #eef1f6;
      color: #43546c;
    }

    &--cancelled,
    &--refunded {
      background: #f0f2ef;
      color: #89938f;
    }
  }

  &__line,
  &__meta {
    margin-top: 16rpx;
    color: #718079;
    font-size: 25rpx;
    line-height: 1.4;
  }

  &__timer {
    width: fit-content;
    margin-top: 18rpx;
    border-radius: 8rpx;
    background: #f8f2df;
    padding: 10rpx 16rpx;
    color: #c9472b;
    font-size: 28rpx;
    font-weight: 700;
    line-height: 1.2;

    &--overtime {
      background: #f7e5de;
    }
  }

  &__footer {
    margin-top: 22rpx;
    border-top: 2rpx solid #eef2ef;
    padding-top: 18rpx;
  }

  &__no {
    min-width: 0;
    color: #89938f;
    font-size: 22rpx;
    line-height: 1.4;
  }

  &__price {
    flex-shrink: 0;
    color: #c9472b;
    font-size: 30rpx;
    font-weight: 700;
    line-height: 1.2;
  }
}

button::after {
  border: none;
}
</style>
