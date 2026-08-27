<script setup lang="ts">
import OrderCard from '@/components/OrderCard.vue'
import OrderStatusTabs from '@/components/OrderStatusTabs.vue'
import type { ManageOrderStatusFilter, Order, OrdersData, OrderStatus, PricingRuleSnapshot } from '@/api/types/order'
import { storeToRefs } from 'pinia'
import { getOrders } from '@/api/order'
import { useFinishTimingOrder } from '@/hooks/useFinishTimingOrder'
import { useLatestRequest } from '@/hooks/useLatestRequest'
import { useNativeLoading } from '@/hooks/useNativeLoading'
import { useUserStore } from '@/store'
import { getOrderExpectedEndedAtTime, getOrderTimeItems } from '@/utils/orderDisplay'

definePage({
  style: {
    navigationBarTitleText: '门店订单',
    enablePullDownRefresh: true,
  },
})

interface StatusTab {
  label: string
  value: ManageOrderStatusFilter
}

type DateFilterKey = 'today' | 'future_3' | 'future_7' | 'future_30' | 'past_7' | 'past_30' | 'custom'

interface DateFilterOption {
  label: string
  value: DateFilterKey
  days: number
  direction: 'future' | 'past'
}

const statusTabs: StatusTab[] = [
  { label: '全部待办', value: 'active' },
  { label: '待核销', value: 'paid' },
  { label: '进行中', value: 'in_progress' },
  { label: '待结账', value: 'pending_checkout' },
  { label: '已完成', value: 'completed' },
  { label: '全部', value: 'all' },
]
const futureDateFilterOptions: DateFilterOption[] = [
  { label: '今日', value: 'today', days: 1, direction: 'future' },
  { label: '未来3天', value: 'future_3', days: 3, direction: 'future' },
  { label: '未来7天', value: 'future_7', days: 7, direction: 'future' },
  { label: '未来30天', value: 'future_30', days: 30, direction: 'future' },
]
const historyDateFilterOptions: DateFilterOption[] = [
  { label: '近7天', value: 'past_7', days: 7, direction: 'past' },
  { label: '近30天', value: 'past_30', days: 30, direction: 'past' },
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
const activeDateFilter = ref<DateFilterKey>('today')
const selectedStartDate = ref(getLocalDateText())
const selectedEndDate = ref(getLocalDateText())
const ordersData = ref<OrdersData>()
const currentTime = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)
const { loading: requestLoading, runLatest } = useLatestRequest()

const orderList = computed(() => ordersData.value?.rows || [])
const summary = computed(() => ordersData.value?.summary)
const activePricingRuleSnapshot = computed<PricingRuleSnapshot | undefined>(() => {
  const rule = ordersData.value?.activePricingRule

  if (!rule) {
    return undefined
  }

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
const currentDateLabel = computed(() => {
  if (selectedStartDate.value === selectedEndDate.value) {
    return selectedStartDate.value
  }

  return `${selectedStartDate.value} 至 ${selectedEndDate.value}`
})
const canWaiveOvertime = computed(() => ['admin', 'super_admin'].includes(userInfo.value.role || ''))
const showInitialLoading = computed(() => requestLoading.value && !ordersData.value)
const showLoadingOverlay = computed(() => requestLoading.value && !!ordersData.value)
useNativeLoading(showLoadingOverlay, '切换中')
const { finishingOrderId, handleFinishTiming } = useFinishTimingOrder({
  currentTime,
  canWaiveOvertime,
  onSuccess: () => fetchOrders(),
})

async function fetchOrders(status: ManageOrderStatusFilter = activeStatus.value) {
  errorText.value = ''

  await runLatest(
    () => getOrders({
      status,
      startDate: selectedStartDate.value,
      endDate: selectedEndDate.value,
    }),
    {
      onSuccess: (res) => {
        ordersData.value = res
        selectedStartDate.value = res.startDate || selectedStartDate.value
        selectedEndDate.value = res.endDate || selectedEndDate.value
      },
      onError: (error) => {
        errorText.value = error instanceof Error ? error.message : '门店订单获取失败'
      },
      onFinally: () => {
        uni.stopPullDownRefresh()
      },
    },
  )
}

function handleChangeDateFilter(option: DateFilterOption) {
  if (requestLoading.value) {
    return
  }

  const today = getLocalDateText()
  activeDateFilter.value = option.value

  if (option.direction === 'past') {
    selectedStartDate.value = addDays(today, -(option.days - 1))
    selectedEndDate.value = today
  }
  else {
    selectedStartDate.value = today
    selectedEndDate.value = addDays(today, option.days - 1)
  }

  fetchOrders()
}

function handleStartDateChange(event: { detail: { value: string } }) {
  const date = event.detail.value

  if (!date) {
    return
  }

  activeDateFilter.value = 'custom'
  selectedStartDate.value = date

  if (selectedEndDate.value < date) {
    selectedEndDate.value = date
  }

  fetchOrders()
}

function handleEndDateChange(event: { detail: { value: string } }) {
  const date = event.detail.value

  if (!date) {
    return
  }

  activeDateFilter.value = 'custom'
  selectedEndDate.value = date

  if (selectedStartDate.value > date) {
    selectedStartDate.value = date
  }

  fetchOrders()
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

function getOrderForFinish(order: Order): Order {
  if (order.pricingRuleSnapshot || !activePricingRuleSnapshot.value) {
    return order
  }

  return {
    ...order,
    pricingRuleId: activePricingRuleSnapshot.value.pricingRuleId,
    pricingRuleSnapshot: activePricingRuleSnapshot.value,
  }
}

function getLocalDateText() {
  const date = new Date()
  const pad = (num: number) => `${num}`.padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00+08:00`)

  if (Number.isNaN(date.getTime())) {
    return getLocalDateText()
  }

  date.setDate(date.getDate() + days)

  const pad = (num: number) => `${num}`.padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function getExpectedEndedAtTime(order: Order) {
  return getOrderExpectedEndedAtTime(order)
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
  if (order.status === 'pending_checkout') {
    return `待顾客支付 ${formatPrice(order.checkoutAmount)}`
  }

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

function getStatusText(order: Order) {
  if (order.orderType === 'metered' && order.status === 'paid') {
    return '待开始'
  }

  return statusTextMap[order.status] || order.status
}

function getOrderTitle(order: Order) {
  if (order.orderType === 'metered') {
    return order.pricingRuleSnapshot?.name || '现场计时'
  }

  const title = order.packageSnapshot?.name || '套餐订单'

  return order.orderSource === 'walk_in' ? `现场开单 · ${title}` : title
}

function getOrderTypeLabel(order: Order) {
  return order.orderType === 'metered' ? '到店计时' : '套餐'
}

function getOrderTimes(order: Order) {
  return getOrderTimeItems(order)
}

function getOrderMeta(order: Order) {
  return `${order.peopleCount} 人 / ${order.rodCount} 根杆`
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
  if (ordersData.value) {
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
      <view class="summary-bar__header">
        <view class="summary-bar__date">
          {{ currentDateLabel }}
        </view>
      </view>
      <view class="date-filter-group">
        <view class="date-filter-group__label">
          未来
        </view>
        <view class="date-filter">
          <view
            v-for="option in futureDateFilterOptions"
            :key="option.value"
            class="date-filter__item"
            :class="{ 'date-filter__item--active': activeDateFilter === option.value }"
            @click="handleChangeDateFilter(option)"
          >
            {{ option.label }}
          </view>
        </view>
      </view>
      <view class="date-filter-group">
        <view class="date-filter-group__label">
          历史
        </view>
        <view class="date-filter">
          <view
            v-for="option in historyDateFilterOptions"
            :key="option.value"
            class="date-filter__item"
            :class="{ 'date-filter__item--active': activeDateFilter === option.value }"
            @click="handleChangeDateFilter(option)"
          >
            {{ option.label }}
          </view>
        </view>
      </view>
      <view class="custom-date-range">
        <view class="custom-date-range__label">
          自定义
        </view>
        <picker mode="date" :value="selectedStartDate" @change="handleStartDateChange">
          <view class="custom-date-range__picker" :class="{ 'custom-date-range__picker--active': activeDateFilter === 'custom' }">
            {{ selectedStartDate }}
          </view>
        </picker>
        <view class="custom-date-range__separator">
          至
        </view>
        <picker mode="date" :value="selectedEndDate" @change="handleEndDateChange">
          <view class="custom-date-range__picker" :class="{ 'custom-date-range__picker--active': activeDateFilter === 'custom' }">
            {{ selectedEndDate }}
          </view>
        </picker>
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
        正在加载门店订单...
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
          :status-text="getStatusText(order)"
          :type-label="getOrderTypeLabel(order)"
          :type-variant="order.orderType"
          :time-items="getOrderTimes(order)"
          :timer-text="getTimingText(order)"
          :timer-level="order.status === 'pending_checkout' ? 'warning' : getTimingLevel(order)"
          :meta-text="getOrderMeta(order)"
          :order-no="order.orderNo"
          :price-text="formatPrice(order.finalAmount)"
          :action-label="order.status === 'in_progress' ? '结束计时' : ''"
          :action-loading="finishingOrderId === order._id"
          :action-disabled="!!finishingOrderId"
          @click="handleViewDetail(order)"
          @action="handleFinishTiming(getOrderForFinish(order))"
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

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20rpx;
  }

  &__date {
    min-width: 0;
    color: #f5ead8;
    font-size: 26rpx;
    font-weight: 600;
    line-height: 1.3;
  }
}

.date-filter {
  display: flex;
  gap: 12rpx;
  overflow-x: auto;
  white-space: nowrap;

  &__item {
    flex-shrink: 0;
    border-radius: 8rpx;
    background: rgb(255 255 255 / 10%);
    padding: 10rpx 16rpx;
    color: #cfe2d8;
    font-size: 23rpx;
    line-height: 1.2;

    &--active {
      background: #f6c453;
      color: #20312b;
      font-weight: 600;
    }
  }
}

.date-filter-group {
  margin-top: 20rpx;

  &__label {
    color: #cfe2d8;
    font-size: 22rpx;
    line-height: 1.2;
    margin-bottom: 12rpx;
  }
}

.custom-date-range {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 20rpx;
  overflow-x: auto;
  white-space: nowrap;

  &__label {
    flex-shrink: 0;
    color: #cfe2d8;
    font-size: 22rpx;
    line-height: 1.2;
    margin-right: 2rpx;
  }

  &__separator {
    flex-shrink: 0;
    color: #cfe2d8;
    font-size: 22rpx;
    line-height: 1.2;
  }

  &__picker {
    flex-shrink: 0;
    border: 2rpx solid rgb(255 255 255 / 16%);
    border-radius: 8rpx;
    background: rgb(255 255 255 / 10%);
    padding: 10rpx 16rpx;
    color: #f5ead8;
    font-size: 23rpx;
    line-height: 1.2;

    &--active {
      border-color: rgb(246 196 83 / 80%);
      background: rgb(246 196 83 / 14%);
      color: #fff0c4;
    }
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
