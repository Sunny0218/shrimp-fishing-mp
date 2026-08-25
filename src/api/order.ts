import type { CloudFunctionResponse } from './types/home'
import type { CancelOrderParams, CancelOrderResult, CreateOrderParams, CreateOrderResult, GetMyOrdersParams, MyOrdersData, OrderDetailData } from './types/order'
import { callCloudFunction } from '@/cloud'

export async function createOrder(params: CreateOrderParams) {
  const requestParams: CreateOrderParams = {
    packageId: params.packageId.trim(),
    slotId: params.slotId.trim(),
    peopleCount: params.peopleCount,
    rodCount: params.rodCount,
    remark: params.remark?.trim() || '',
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<CreateOrderResult>, Record<string, unknown>>(
    'createOrder',
    { ...requestParams },
  )

  if (res.code !== 0) {
    throw new Error(res.message || '预约创建失败')
  }

  return res.data
  // #endif

  throw new Error('当前平台暂不支持创建预约')
}

export async function getOrderDetail(orderId: string) {
  const safeOrderId = orderId.trim()

  if (!safeOrderId) {
    throw new Error('缺少订单 ID')
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<OrderDetailData>, Record<string, unknown>>(
    'getOrderDetail',
    {
      orderId: safeOrderId,
    },
  )

  if (res.code !== 0) {
    throw new Error(res.message || '订单详情获取失败')
  }

  return res.data
  // #endif

  throw new Error('当前平台暂不支持查询订单详情')
}

export async function getMyOrders(params: GetMyOrdersParams = {}) {
  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<MyOrdersData>, Record<string, unknown>>(
    'getMyOrders',
    {
      status: params.status || 'all',
    },
  )

  if (res.code !== 0) {
    throw new Error(res.message || '我的订单获取失败')
  }

  return res.data
  // #endif

  return {
    rows: [],
    total: 0,
    serverTime: new Date().toISOString(),
  }
}

export async function cancelOrder(params: CancelOrderParams) {
  const orderId = params.orderId.trim()

  if (!orderId) {
    throw new Error('缺少订单 ID')
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<CancelOrderResult>, Record<string, unknown>>(
    'cancelOrder',
    {
      orderId,
    },
  )

  if (res.code !== 0) {
    throw new Error(res.message || '取消预约失败')
  }

  return res.data
  // #endif

  throw new Error('当前平台暂不支持取消预约')
}
