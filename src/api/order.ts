import type { CloudFunctionResponse } from './types/home'
import type { CancelOrderParams, CancelOrderResult, CheckInOrderParams, CheckInOrderResult, CreateOrderParams, CreateOrderResult, CreateWalkInOrderParams, CreateWalkInOrderResult, FinishTimingOrderParams, FinishTimingOrderResult, GetMyOrdersParams, GetOrdersParams, MyOrdersData, OrderDetailData, OrdersData, PayCheckoutOrderParams, PayCheckoutOrderResult, PayOrderParams, PayOrderResult, UpdateRodSessionParams, UpdateRodSessionResult } from './types/order'
import { assertLogin, resolveCloudResponse } from './authGuard'
import { callCloudFunction } from '@/cloud'

export async function createOrder(params: CreateOrderParams) {
  assertLogin('请先登录后再预约')

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

  return resolveCloudResponse(res, '预约创建失败')
  // #endif

  throw new Error('当前平台暂不支持创建预约')
}

export async function createWalkInOrder(params: CreateWalkInOrderParams) {
  assertLogin('请先登录后再现场开单')

  const requestParams: CreateWalkInOrderParams = {
    customerPhone: params.customerPhone?.trim() || '',
    rodCount: params.rodCount,
    remark: params.remark?.trim() || '',
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<CreateWalkInOrderResult>, Record<string, unknown>>(
    'createWalkInOrder',
    { ...requestParams },
  )

  return resolveCloudResponse(res, '现场开单失败')
  // #endif

  throw new Error('当前平台暂不支持现场开单')
}

export async function getOrderDetail(orderId: string) {
  assertLogin('请先登录后查看订单详情')

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

  return resolveCloudResponse(res, '订单详情获取失败')
  // #endif

  throw new Error('当前平台暂不支持查询订单详情')
}

export async function getMyOrders(params: GetMyOrdersParams = {}) {
  assertLogin('请先登录后查看我的订单')

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<MyOrdersData>, Record<string, unknown>>(
    'getMyOrders',
    {
      status: params.status || 'all',
      ...(params.page ? { page: params.page } : {}),
      ...(params.pageSize ? { pageSize: params.pageSize } : {}),
    },
  )

  return resolveCloudResponse(res, '我的订单获取失败')
  // #endif

  return {
    rows: [],
    page: params.page || 1,
    pageSize: params.pageSize || 20,
    total: 0,
    hasMore: false,
    serverTime: new Date().toISOString(),
  }
}

export async function getOrders(params: GetOrdersParams = {}) {
  assertLogin('请先登录后查看门店订单')

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<OrdersData>, Record<string, unknown>>(
    'getOrders',
    {
      status: params.status || 'active',
      ...(params.date ? { date: params.date.trim() } : {}),
      ...(params.startDate ? { startDate: params.startDate.trim() } : {}),
      ...(params.endDate ? { endDate: params.endDate.trim() } : {}),
      ...(params.page ? { page: params.page } : {}),
      ...(params.pageSize ? { pageSize: params.pageSize } : {}),
    },
  )

  return resolveCloudResponse(res, '门店订单获取失败')
  // #endif

  return {
    rows: [],
    page: params.page || 1,
    pageSize: params.pageSize || 20,
    total: 0,
    hasMore: false,
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
  assertLogin('请先登录后取消预约')

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

  return resolveCloudResponse(res, '取消预约失败')
  // #endif

  throw new Error('当前平台暂不支持取消预约')
}

export async function payOrder(params: PayOrderParams) {
  assertLogin('请先登录后支付订单')

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

  return resolveCloudResponse(res, '订单支付失败')
  // #endif

  throw new Error('当前平台暂不支持订单支付')
}

export async function checkInOrder(params: CheckInOrderParams) {
  assertLogin('请先登录后开始计时')

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

  return resolveCloudResponse(res, '订单核销失败')
  // #endif

  throw new Error('当前平台暂不支持核销订单')
}

export async function finishTimingOrder(params: FinishTimingOrderParams) {
  assertLogin('请先登录后结束计时')

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

  return resolveCloudResponse(res, '结束计时失败')
  // #endif

  throw new Error('当前平台暂不支持结束计时')
}

export async function payCheckoutOrder(params: PayCheckoutOrderParams) {
  assertLogin('请先登录后支付结算金额')

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

  return resolveCloudResponse(res, '支付结算金额失败')
  // #endif

  throw new Error('当前平台暂不支持支付结算金额')
}

export async function updateRodSession(params: UpdateRodSessionParams) {
  assertLogin('请先登录后操作杆位')

  const orderId = params.orderId.trim()
  const rodSessionId = params.rodSessionId.trim()

  if (!orderId) {
    throw new Error('缺少订单 ID')
  }

  if (!rodSessionId) {
    throw new Error('缺少杆位 ID')
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<UpdateRodSessionResult>, Record<string, unknown>>(
    'updateRodSession',
    {
      orderId,
      rodSessionId,
      action: params.action,
    },
  )

  return resolveCloudResponse(res, '杆位操作失败')
  // #endif

  throw new Error('当前平台暂不支持杆位操作')
}
