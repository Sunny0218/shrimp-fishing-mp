<script setup lang="ts">
import type { Order, OrderStatus } from '@/api/types/order'
import { getMyOrders } from '@/api/order'

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

const loading = ref(false)
const errorText = ref('')
const activeStatus = ref<OrderStatus | 'all'>('all')
const orderList = ref<Order[]>([])

async function fetchOrders() {
  loading.value = true
  errorText.value = ''

  try {
    const res = await getMyOrders({
      status: activeStatus.value,
    })
    orderList.value = res.rows || []
  }
  catch (error) {
    errorText.value = error instanceof Error ? error.message : '我的订单获取失败'
  }
  finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

function handleChangeStatus(status: OrderStatus | 'all') {
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

function getStatusText(status: OrderStatus) {
  return statusTextMap[status] || status
}

function formatPrice(price?: number) {
  return `¥${((price || 0) / 100).toFixed(0)}`
}

function getOrderTitle(order: Order) {
  return order.packageSnapshot?.name || '套餐预约'
}

function getOrderTime(order: Order) {
  const slot = order.slotSnapshot

  if (!slot?.date) {
    return '预约时间待确认'
  }

  return `${slot.date} ${slot.startTime}-${slot.endTime}`
}

onLoad(() => {
  fetchOrders()
})

onShow(() => {
  if (orderList.value.length > 0) {
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
      <view
        v-for="tab in statusTabs"
        :key="tab.value"
        class="orders-page__tab"
        :class="{ 'orders-page__tab--active': activeStatus === tab.value }"
        @click="handleChangeStatus(tab.value)"
      >
        {{ tab.label }}
      </view>
    </view>

    <view v-if="loading" class="orders-page__placeholder">
      正在加载订单...
    </view>

    <view v-else-if="errorText" class="orders-page__error">
      <text>{{ errorText }}</text>
      <button class="orders-page__retry" @click="fetchOrders">
        重试
      </button>
    </view>

    <view v-else-if="!orderList.length" class="orders-page__placeholder">
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
          <view class="order-card__status">
            {{ getStatusText(order.status) }}
          </view>
        </view>
        <view class="order-card__time">
          {{ getOrderTime(order) }}
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
.orders-page {
  min-height: 100vh;
  background: #f4f7f2;
  padding: 24rpx 28rpx 40rpx;
  color: #17211d;

  &__tabs {
    display: flex;
    gap: 14rpx;
    overflow-x: auto;
    padding-bottom: 18rpx;
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
  }

  &__time {
    margin-top: 18rpx;
    color: #4f6059;
    font-size: 26rpx;
    line-height: 1.4;
  }

  &__meta {
    margin-top: 10rpx;
    color: #718079;
    font-size: 24rpx;
    line-height: 1.35;
  }

  &__footer {
    margin-top: 24rpx;
    border-top: 2rpx solid #eef2ef;
    padding-top: 20rpx;
  }

  &__no {
    min-width: 0;
    color: #87928d;
    font-size: 22rpx;
    line-height: 1.3;
  }

  &__price {
    flex-shrink: 0;
    color: #c9472b;
    font-size: 34rpx;
    font-weight: 700;
    line-height: 1.2;
  }
}

button::after {
  border: none;
}
</style>
