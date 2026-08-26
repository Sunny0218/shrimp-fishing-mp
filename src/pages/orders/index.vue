<script setup lang="ts">
import OrderCard from '@/components/OrderCard.vue'
import OrderStatusTabs from '@/components/OrderStatusTabs.vue'
import type { Order, OrderStatus } from '@/api/types/order'
import { getMyOrders } from '@/api/order'
import { useLatestRequest } from '@/hooks/useLatestRequest'
import { useNativeLoading } from '@/hooks/useNativeLoading'
import { getOrderTimeItems } from '@/utils/orderDisplay'

definePage({
  style: {
    navigationBarTitleText: '我的订单',
    enablePullDownRefresh: true,
  },
})

interface StatusTab {
  label: string
  value: OrderStatus | 'all'
}

const statusTabs: StatusTab[] = [
  { label: '全部', value: 'all' },
  { label: '待到店', value: 'paid' },
  { label: '进行中', value: 'in_progress' },
  { label: '已完成', value: 'completed' },
  { label: '已取消', value: 'cancelled' },
]

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

const errorText = ref('')
const activeStatus = ref<OrderStatus | 'all'>('all')
const orderList = ref<Order[]>([])
const hasFetchedOrders = ref(false)
const { loading: requestLoading, runLatest } = useLatestRequest()
const showInitialLoading = computed(() => requestLoading.value && !hasFetchedOrders.value)
const showLoadingOverlay = computed(() => requestLoading.value && hasFetchedOrders.value)
useNativeLoading(showLoadingOverlay, '切换中')

async function fetchOrders(status: OrderStatus | 'all' = activeStatus.value) {
  errorText.value = ''

  await runLatest(
    () => getMyOrders({ status }),
    {
      onSuccess: (res) => {
        orderList.value = res.rows || []
        hasFetchedOrders.value = true
      },
      onError: (error) => {
        errorText.value = error instanceof Error ? error.message : '我的订单获取失败'
        hasFetchedOrders.value = true
      },
      onFinally: () => {
        uni.stopPullDownRefresh()
      },
    },
  )
}

function handleChangeStatus(statusValue: string) {
  const status = statusValue as OrderStatus | 'all'

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

function getStatusText(status: OrderStatus) {
  return statusTextMap[status] || status
}

function formatPrice(price?: number) {
  return `¥${((price || 0) / 100).toFixed(0)}`
}

function getOrderTitle(order: Order) {
  return order.packageSnapshot?.name || '套餐预约'
}

function getOrderTimes(order: Order) {
  return getOrderTimeItems(order)
}

function getOrderMeta(order: Order) {
  return `${order.peopleCount} 人 / ${order.rodCount} 根杆`
}

onLoad(() => {
  fetchOrders()
})

onShow(() => {
  if (hasFetchedOrders.value) {
    fetchOrders()
  }
})

onPullDownRefresh(() => {
  fetchOrders()
})
</script>

<template>
  <view class="orders-page">
    <view class="orders-page__tabs">
      <OrderStatusTabs
        :tabs="statusTabs"
        :active="activeStatus"
        :disabled="requestLoading"
        @change="handleChangeStatus"
      />
    </view>

    <view class="orders-page__content">
      <view v-if="showInitialLoading" class="orders-page__placeholder">
        正在加载订单...
      </view>

      <view v-else-if="errorText" class="orders-page__error">
        <text>{{ errorText }}</text>
        <button class="orders-page__retry" @click="fetchOrders()">
          重试
        </button>
      </view>

      <view v-else-if="!orderList.length" class="orders-page__placeholder">
        暂无订单
      </view>

      <view v-else class="order-list">
        <OrderCard
          v-for="order in orderList"
          :key="order._id"
          :title="getOrderTitle(order)"
          :status="order.status"
          :status-text="getStatusText(order.status)"
          :time-items="getOrderTimes(order)"
          :meta-text="getOrderMeta(order)"
          :order-no="order.orderNo"
          :price-text="formatPrice(order.finalAmount)"
          @click="handleViewDetail(order)"
        />
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.orders-page {
  min-height: 100vh;
  background: #f4f7f2;
  padding: 24rpx 28rpx 40rpx;
  color: #17211d;

  &__tabs {
    display: block;
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

.order-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

button::after {
  border: none;
}
</style>
