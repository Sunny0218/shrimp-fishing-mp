import { CloudBusinessError } from '@/api/authGuard'
import type { BlockingPaymentOrderData, OrderStatus } from '@/api/types/order'

const ordersStatusFilterKey = 'orders_status_filter'
const paymentOrderStatuses: OrderStatus[] = ['pending_payment', 'pending_checkout']

function isBlockingPaymentOrderData(data: unknown): data is BlockingPaymentOrderData {
  if (!data || typeof data !== 'object') {
    return false
  }

  const record = data as Partial<BlockingPaymentOrderData>

  return record.reason === 'blocking_payment_order'
    && typeof record.orderId === 'string'
    && paymentOrderStatuses.includes(record.status as OrderStatus)
}

export function isBlockingPaymentOrderError(error: unknown): error is CloudBusinessError<BlockingPaymentOrderData> {
  return error instanceof CloudBusinessError
    && error.code === 409
    && isBlockingPaymentOrderData(error.data)
}

export function saveOrdersStatusFilter(status: OrderStatus) {
  uni.setStorageSync(ordersStatusFilterKey, status)
}

export function consumeOrdersStatusFilter(): OrderStatus | '' {
  const status = uni.getStorageSync(ordersStatusFilterKey)
  uni.removeStorageSync(ordersStatusFilterKey)

  return paymentOrderStatuses.includes(status as OrderStatus) ? status as OrderStatus : ''
}

export function showBlockingPaymentOrderModal(error: CloudBusinessError<BlockingPaymentOrderData>) {
  const status = error.data?.status === 'pending_checkout' ? 'pending_checkout' : 'pending_payment'
  const orderText = error.data?.dailyNo || error.data?.orderNo || ''
  const content = orderText
    ? `${error.message}\n订单：${orderText}`
    : error.message

  uni.showModal({
    title: '存在待支付订单',
    content,
    cancelText: '取消',
    confirmText: '去支付',
    confirmColor: '#1f6b56',
    success: (res) => {
      if (!res.confirm) {
        return
      }

      saveOrdersStatusFilter(status)
      uni.switchTab({
        url: '/pages/orders/index',
      })
    },
  })
}
