import type { CloudFunctionResponse } from './types/home'
import type { CancelOrderParams, CancelOrderResult, CheckInOrderParams, CheckInOrderResult, CreateOrderParams, CreateOrderResult, CreateWalkInOrderParams, CreateWalkInOrderResult, FinishTimingOrderParams, FinishTimingOrderResult, GetMyOrdersParams, GetOrdersParams, MyOrdersData, OrderDetailData, OrdersData, PayCheckoutOrderParams, PayCheckoutOrderResult, PayOrderParams, PayOrderResult } from './types/order'
import { callCloudFunction } from '@/cloud'

export async function createOrder(params: CreateOrderParams) {
  const requestParams: CreateOrderParams = {
    packageId: params.packageId.trim(),
    remark: params.remark?.trim() || '',
  }

  if (params.slotId) {
    requestParams.slotId = params.slotId.trim()
  }

  if (params.peopleCount) {
    requestParams.peopleCount = params.peopleCount
  }

  if (params.rodCount) {
    requestParams.rodCount = params.rodCount
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

export async function createWalkInOrder(params: CreateWalkInOrderParams) {
  const requestParams: CreateWalkInOrderParams = {
    customerPhone: params.customerPhone?.trim() || '',
    remark: params.remark?.trim() || '',
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<CreateWalkInOrderResult>, Record<string, unknown>>(
    'createWalkInOrder',
    { ...requestParams },
  )

  if (res.code !== 0) {
    throw new Error(res.message || '现场开单失败')
  }

  return res.data
  // #endif

  throw new Error('当前平台暂不支持现场开单')
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

export async function getOrders(params: GetOrdersParams = {}) {
  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<OrdersData>, Record<string, unknown>>(
    'getOrders',
    {
      status: params.status || 'active',
      ...(params.date ? { date: params.date.trim() } : {}),
      ...(params.startDate ? { startDate: params.startDate.trim() } : {}),
      ...(params.endDate ? { endDate: params.endDate.trim() } : {}),
    },
  )

  if (res.code !== 0) {
    throw new Error(res.message || '门店订单获取失败')
  }

  return res.data
  // #endif

  return {
    rows: [],
    total: 0,
    summary: {
      all: 0,
      active: 0,
      paid: 0,
      inProgress: 0,
      pendingCheckout: 0,
      completed: 0,
      cancelled: 0,
    },
    date: '',
    startDate: '',
    endDate: '',
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

export async function payOrder(params: PayOrderParams) {
  const orderId = params.orderId.trim()

  if (!orderId) {
    throw new Error('缺少订单 ID')
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<PayOrderResult>, Record<string, unknown>>(
    'payOrder',
    {
      orderId,
    },
  )

  if (res.code !== 0) {
    throw new Error(res.message || '订单支付失败')
  }

  return res.data
  // #endif

  throw new Error('当前平台暂不支持订单支付')
}

export async function checkInOrder(params: CheckInOrderParams) {
  const checkinCode = params.checkinCode.trim()
  const orderId = params.orderId?.trim()

  if (!checkinCode) {
    throw new Error('请输入核销码')
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<CheckInOrderResult>, Record<string, unknown>>(
    'checkInOrder',
    {
      checkinCode,
      ...(orderId ? { orderId } : {}),
    },
  )

  if (res.code !== 0) {
    throw new Error(res.message || '订单核销失败')
  }

  return res.data
  // #endif

  throw new Error('当前平台暂不支持核销订单')
}

export async function finishTimingOrder(params: FinishTimingOrderParams) {
  const orderId = params.orderId.trim()

  if (!orderId) {
    throw new Error('缺少订单 ID')
  }

  const waiverReason = params.waiverReason?.trim()
  const earlyFinishReason = params.earlyFinishReason?.trim()
  const reason = params.reason?.trim()

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<FinishTimingOrderResult>, Record<string, unknown>>(
    'finishTimingOrder',
    {
      orderId,
      waiveOvertime: !!params.waiveOvertime,
      ...(waiverReason ? { waiverReason } : {}),
      ...(earlyFinishReason ? { earlyFinishReason } : {}),
      ...(reason ? { reason } : {}),
    },
  )

  if (res.code !== 0) {
    throw new Error(res.message || '结束计时失败')
  }

  return res.data
  // #endif

  throw new Error('当前平台暂不支持结束计时')
}

export async function payCheckoutOrder(params: PayCheckoutOrderParams) {
  const orderId = params.orderId.trim()

  if (!orderId) {
    throw new Error('缺少订单 ID')
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<PayCheckoutOrderResult>, Record<string, unknown>>(
    'payCheckoutOrder',
    {
      orderId,
    },
  )

  if (res.code !== 0) {
    throw new Error(res.message || '支付结算金额失败')
  }

  return res.data
  // #endif

  throw new Error('当前平台暂不支持支付结算金额')
}
