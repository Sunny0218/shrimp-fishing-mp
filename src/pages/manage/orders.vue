<script setup lang="ts">
import ListFooter from '@/components/ListFooter.vue'
import OrderCard from '@/components/OrderCard.vue'
import OrderStatusTabs from '@/components/OrderStatusTabs.vue'
import PageState from '@/components/PageState.vue'
import type { ManageOrderStatusFilter, Order, OrdersData, OrderStatus, PricingRuleSnapshot } from '@/api/types/order'
import { storeToRefs } from 'pinia'
import { checkInOrder, getOrders } from '@/api/order'
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
const page = ref(1)
const pageSize = 20
const loadingMore = ref(false)
const currentTime = ref(Date.now())
const checkingInOrderId = ref('')
let timer: ReturnType<typeof setInterval> | undefined
const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)
const { loading: requestLoading, runLatest } = useLatestRequest()

const orderList = computed(() => ordersData.value?.rows || [])
const summary = computed(() => ordersData.value?.summary)
const total = computed(() => ordersData.value?.total || 0)
const hasMore = computed(() => orderList.value.length < total.value)
const showListFooter = computed(() => !!ordersData.value && orderList.value.length > 0)
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
const canManageCheckin = computed(() => ['staff', 'admin', 'super_admin'].includes(userInfo.value.role || ''))
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
      page: 1,
      pageSize,
    }),
    {
      onSuccess: (res) => {
        ordersData.value = res
        page.value = res.page || 1
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

async function loadMoreOrders() {
  if (requestLoading.value || loadingMore.value || !hasMore.value) {
    return
  }

  loadingMore.value = true
  errorText.value = ''

  try {
    const nextPage = page.value + 1
    const status = activeStatus.value
    const startDate = selectedStartDate.value
    const endDate = selectedEndDate.value
    const res = await getOrders({
      status,
      startDate,
      endDate,
      page: nextPage,
      pageSize,
    })

    if (status !== activeStatus.value || startDate !== selectedStartDate.value || endDate !== selectedEndDate.value) {
      return
    }

    ordersData.value = {
      ...res,
      rows: [...orderList.value, ...(res.rows || [])],
    }
    page.value = res.page || nextPage
    selectedStartDate.value = res.startDate || selectedStartDate.value
    selectedEndDate.value = res.endDate || selectedEndDate.value
  }
  catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '加载更多订单失败',
      icon: 'none',
    })
  }
  finally {
    loadingMore.value = false
  }
}

function handleChangeDateFilter(option: DateFilterOption) {
  if (requestLoading.value || loadingMore.value) {
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
  if (requestLoading.value || loadingMore.value) {
    return
  }

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
  if (requestLoading.value || loadingMore.value) {
    return
  }

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

  if (loadingMore.value) {
    return
  }

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

function getOrderActionLabel(order: Order) {
  if (order.status === 'paid' && canManageCheckin.value) {
    return order.orderType === 'metered' ? '开始计时' : '核销'
  }

  if (order.status === 'in_progress') {
    return '结束计时'
  }

  return ''
}

function isOrderActionLoading(order: Order) {
  return finishingOrderId.value === order._id || checkingInOrderId.value === order._id
}

function isOrderActionDisabled() {
  return !!finishingOrderId.value || !!checkingInOrderId.value
}

function handleOrderAction(order: Order) {
  if (order.status === 'paid') {
    handleCheckInOrder(order)
    return
  }

  if (order.status === 'in_progress') {
    handleFinishTiming(getOrderForFinish(order))
  }
}

function handleCheckInOrder(order: Order) {
  if (!canManageCheckin.value || checkingInOrderId.value || !order.checkinCode) {
    return
  }

  const actionText = order.orderType === 'metered' ? '开始计时' : '核销'
  const displayNo = order.dailyNo || order.orderNo

  uni.showModal({
    title: actionText,
    content: `确认对订单 ${displayNo} ${actionText}吗？确认后订单会进入计时中。`,
    confirmText: actionText,
    confirmColor: '#1f6b56',
    success: async (res) => {
      if (!res.confirm) {
        return
      }

      checkingInOrderId.value = order._id

      try {
        await checkInOrder({
          orderId: order._id,
          checkinCode: order.checkinCode,
        })
        uni.showToast({
          title: `${actionText}成功`,
          icon: 'success',
        })
        await fetchOrders()
      }
      catch (error) {
        uni.showToast({
          title: error instanceof Error ? error.message : `${actionText}失败`,
          icon: 'none',
        })
      }
      finally {
        checkingInOrderId.value = ''
      }
    },
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
  return `${order.rodCount} 支杆`
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

onReachBottom(() => {
  loadMoreOrders()
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
        :disabled="requestLoading || loadingMore"
        @change="handleChangeStatus"
      />
    </view>

    <view class="today-orders-page__content">
      <PageState v-if="showInitialLoading" text="正在加载门店订单..." />

      <PageState
        v-else-if="errorText"
        :text="errorText"
        button-text="重试"
        variant="error"
        @action="fetchOrders()"
      />

      <PageState v-else-if="!orderList.length" text="暂无订单" />

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
          :daily-no="order.dailyNo"
          :price-text="formatPrice(order.finalAmount)"
          :action-label="getOrderActionLabel(order)"
          :action-loading="isOrderActionLoading(order)"
          :action-disabled="isOrderActionDisabled()"
          @click="handleViewDetail(order)"
          @action="handleOrderAction(order)"
        />

        <ListFooter v-if="showListFooter" :loading="loadingMore" :has-more="hasMore" done-text="没有更多订单了" />
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
</style>
