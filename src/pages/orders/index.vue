<script setup lang="ts">
import ListFooter from '@/components/ListFooter.vue'
import OrderCard from '@/components/OrderCard.vue'
import OrderStatusTabs from '@/components/OrderStatusTabs.vue'
import PageState from '@/components/PageState.vue'
import type { Order, OrderStatus } from '@/api/types/order'
import { getMyOrders } from '@/api/order'
import { useLatestRequest } from '@/hooks/useLatestRequest'
import { useNativeLoading } from '@/hooks/useNativeLoading'
import { useTokenStore } from '@/store'
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
  { label: '待结账', value: 'pending_checkout' },
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
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loadingMore = ref(false)
const tokenStore = useTokenStore()
const { loading: requestLoading, runLatest } = useLatestRequest()
const isLoggedIn = computed(() => tokenStore.hasLogin)
const showInitialLoading = computed(() => requestLoading.value && !hasFetchedOrders.value)
const showLoadingOverlay = computed(() => requestLoading.value && hasFetchedOrders.value)
const hasMore = computed(() => orderList.value.length < total.value)
const showListFooter = computed(() => hasFetchedOrders.value && isLoggedIn.value && orderList.value.length > 0)
useNativeLoading(showLoadingOverlay, '切换中')

async function fetchOrders(status: OrderStatus | 'all' = activeStatus.value) {
  errorText.value = ''

  if (!isLoggedIn.value) {
    orderList.value = []
    page.value = 1
    total.value = 0
    hasFetchedOrders.value = true
    uni.stopPullDownRefresh()
    return
  }

  await runLatest(
    () => getMyOrders({
      status,
      page: 1,
      pageSize,
    }),
    {
      onSuccess: (res) => {
        orderList.value = res.rows || []
        page.value = res.page || 1
        total.value = res.total || 0
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

async function loadMoreOrders() {
  if (!isLoggedIn.value || requestLoading.value || loadingMore.value || !hasMore.value) {
    return
  }

  loadingMore.value = true
  errorText.value = ''

  try {
    const nextPage = page.value + 1
    const status = activeStatus.value
    const res = await getMyOrders({
      status,
      page: nextPage,
      pageSize,
    })

    if (status !== activeStatus.value) {
      return
    }

    orderList.value = [...orderList.value, ...(res.rows || [])]
    page.value = res.page || nextPage
    total.value = res.total ?? total.value
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

function handleChangeStatus(statusValue: string) {
  const status = statusValue as OrderStatus | 'all'

  if (loadingMore.value) {
    return
  }

  if (activeStatus.value === status) {
    return
  }

  activeStatus.value = status
  fetchOrders(status)
}

function handleGoLogin() {
  uni.navigateTo({
    url: `/pages/auth/login?redirect=${encodeURIComponent('/pages/orders/index')}`,
  })
}

function handleViewDetail(order: Order) {
  uni.navigateTo({
    url: `/pages/orders/detail?id=${order._id}`,
  })
}

function getStatusText(order: Order) {
  if (order.orderType === 'metered' && order.status === 'paid') {
    return '待开始'
  }

  return statusTextMap[order.status] || order.status
}

function formatPrice(price?: number) {
  return `¥${((price || 0) / 100).toFixed(0)}`
}

function getOrderTitle(order: Order) {
  if (order.orderType === 'metered') {
    return order.pricingRuleSnapshot?.name || '现场计时'
  }

  return order.packageSnapshot?.name || '套餐预约'
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

function getCheckoutText(order: Order) {
  if (order.status !== 'pending_checkout') {
    return ''
  }

  return order.orderType === 'metered'
    ? `待支付 ${formatPrice(order.checkoutAmount)}`
    : `待补款 ${formatPrice(order.checkoutAmount)}`
}

onLoad(() => {
  tokenStore.updateNowTime()
  fetchOrders()
})

onShow(() => {
  tokenStore.updateNowTime()

  if (!isLoggedIn.value) {
    orderList.value = []
    hasFetchedOrders.value = true
    return
  }

  if (hasFetchedOrders.value) {
    fetchOrders()
  }
})

onPullDownRefresh(() => {
  fetchOrders()
})

onReachBottom(() => {
  loadMoreOrders()
})
</script>

<template>
  <view class="orders-page">
    <view class="orders-page__tabs">
      <OrderStatusTabs
        :tabs="statusTabs"
        :active="activeStatus"
        :disabled="requestLoading || loadingMore"
        @change="handleChangeStatus"
      />
    </view>

    <view class="orders-page__content">
      <PageState v-if="showInitialLoading" text="正在加载订单..." />

      <PageState
        v-else-if="!isLoggedIn"
        text="登录后查看你的预约和订单"
        button-text="去登录"
        @action="handleGoLogin"
      />

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
          :timer-text="getCheckoutText(order)"
          :timer-level="order.status === 'pending_checkout' ? 'warning' : ''"
          :meta-text="getOrderMeta(order)"
          :order-no="order.orderNo"
          :daily-no="order.dailyNo"
          :price-text="formatPrice(order.finalAmount)"
          @click="handleViewDetail(order)"
        />

        <ListFooter v-if="showListFooter" :loading="loadingMore" :has-more="hasMore" done-text="没有更多订单了" />
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
