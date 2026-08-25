<script setup lang="ts">
import type { OrderDetailData, OrderStatus } from '@/api/types/order'
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

const order = computed(() => orderDetail.value?.order)
const packageSnapshot = computed(() => order.value?.packageSnapshot)
const slotSnapshot = computed(() => order.value?.slotSnapshot)
const canCancel = computed(() => order.value ? ['pending_payment', 'paid'].includes(order.value.status) : false)

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
  fetchOrderDetail()
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
        <view class="order-detail__title">
          预约成功
        </view>
        <view class="order-detail__order-no">
          订单号：{{ order.orderNo }}
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
            日期
          </text>
          <text class="info-row__value">
            {{ slotSnapshot?.date || '-' }}
          </text>
        </view>
        <view class="info-row">
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
            人数/杆数
          </text>
          <text class="info-row__value">
            {{ order.peopleCount }} 人 / {{ order.rodCount }} 根杆
          </text>
        </view>
      </view>

      <view class="order-card">
        <view class="order-card__title">
          到店核销
        </view>
        <view class="checkin-code">
          {{ order.checkinCode }}
        </view>
        <view class="order-card__tip">
          到店后向服务员出示核销码，核销后开始计时。
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

.checkin-code {
  border-radius: 8rpx;
  background: #f8f2df;
  padding: 30rpx 20rpx;
  color: #17211d;
  font-size: 56rpx;
  font-weight: 700;
  letter-spacing: 8rpx;
  line-height: 1.2;
  text-align: center;
}

button::after {
  border: none;
}

button[disabled] {
  opacity: 0.6;
}
</style>
