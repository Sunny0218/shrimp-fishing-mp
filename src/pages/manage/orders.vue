<script setup lang="ts">
import OrderCard from '@/components/OrderCard.vue'
import OrderStatusTabs from '@/components/OrderStatusTabs.vue'
import type { ManageOrderStatusFilter, Order, OrderStatus, TodayOrdersData } from '@/api/types/order'
import { storeToRefs } from 'pinia'
import { getTodayOrders } from '@/api/order'
import { useFinishTimingOrder } from '@/hooks/useFinishTimingOrder'
import { useLatestRequest } from '@/hooks/useLatestRequest'
import { useNativeLoading } from '@/hooks/useNativeLoading'
import { useUserStore } from '@/store'

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
  { label: '全部待办', value: 'active' },
  { label: '待核销', value: 'paid' },
  { label: '进行中', value: 'in_progress' },
  { label: '待结账', value: 'pending_checkout' },
  { label: '已完成', value: 'completed' },
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

const errorText = ref('')
const activeStatus = ref<ManageOrderStatusFilter>('active')
const todayOrders = ref<TodayOrdersData>()
const currentTime = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)
const { loading: requestLoading, runLatest } = useLatestRequest()

const orderList = computed(() => todayOrders.value?.rows || [])
const summary = computed(() => todayOrders.value?.summary)
const currentDate = computed(() => todayOrders.value?.date || getLocalDateText())
const canWaiveOvertime = computed(() => ['admin', 'super_admin'].includes(userInfo.value.role || ''))
const showInitialLoading = computed(() => requestLoading.value && !todayOrders.value)
const showLoadingOverlay = computed(() => requestLoading.value && !!todayOrders.value)
useNativeLoading(showLoadingOverlay, '切换中')
const { finishingOrderId, handleFinishTiming } = useFinishTimingOrder({
  currentTime,
  canWaiveOvertime,
  onSuccess: () => fetchOrders(),
})

async function fetchOrders(status: ManageOrderStatusFilter = activeStatus.value) {
  errorText.value = ''

  await runLatest(
    () => getTodayOrders({ status }),
    {
      onSuccess: (res) => {
        todayOrders.value = res
      },
      onError: (error) => {
        errorText.value = error instanceof Error ? error.message : '今日订单获取失败'
      },
      onFinally: () => {
        uni.stopPullDownRefresh()
      },
    },
  )
}

function handleChangeStatus(statusValue: string) {
  const status = statusValue as ManageOrderStatusFilter

  if (activeStatus.value === status) {
    return
  }

  activeStatus.value = status
  fetchOrders(status)
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

  if (rest <= 10 * 60 * 1000) {
    return `快到点 ${formatCountdown(rest)}`
  }

  return `剩余 ${formatCountdown(rest)}`
}

function getTimingLevel(order: Order): 'warning' | 'overtime' | '' {
  if (order.status !== 'in_progress') {
    return ''
  }

  const expectedEndedAt = getExpectedEndedAtTime(order)

  if (!expectedEndedAt) {
    return ''
  }

  const rest = expectedEndedAt - currentTime.value

  if (rest <= 0) {
    return 'overtime'
  }

  if (rest <= 10 * 60 * 1000) {
    return 'warning'
  }

  return ''
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

function getOrderMeta(order: Order) {
  return `${order.peopleCount} 人 / ${order.rodCount} 根杆`
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
            待办
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
      <OrderStatusTabs
        :tabs="statusTabs"
        :active="activeStatus"
        :disabled="requestLoading"
        @change="handleChangeStatus"
      />
    </view>

    <view class="today-orders-page__content">
      <view v-if="showInitialLoading" class="today-orders-page__placeholder">
        正在加载今日订单...
      </view>

      <view v-else-if="errorText" class="today-orders-page__error">
        <text>{{ errorText }}</text>
        <button class="today-orders-page__retry" @click="fetchOrders()">
          重试
        </button>
      </view>

      <view v-else-if="!orderList.length" class="today-orders-page__placeholder">
        暂无订单
      </view>

      <view v-else class="order-list">
        <OrderCard
          v-for="order in orderList"
          :key="order._id"
          :title="getOrderTitle(order)"
          :status="order.status"
          :status-text="getStatusText(order.status)"
          :time-text="getOrderTime(order)"
          :timer-text="getTimingText(order)"
          :timer-level="getTimingLevel(order)"
          :meta-text="getOrderMeta(order)"
          :order-no="order.orderNo"
          :price-text="formatPrice(order.finalAmount)"
          :action-label="order.status === 'in_progress' ? '结束计时' : ''"
          :action-loading="finishingOrderId === order._id"
          :action-disabled="!!finishingOrderId"
          @click="handleViewDetail(order)"
          @action="handleFinishTiming(order)"
        />
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
    padding: 22rpx 0 18rpx;
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

  &__content {
    position: relative;
    min-height: 260rpx;
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

button::after {
  border: none;
}
</style>
