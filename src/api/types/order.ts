import type { ShrimpPackage, TimeSlot } from './home'

export type OrderType = 'package' | 'metered'
export type OrderStatus
  = | 'pending_payment'
    | 'paid'
    | 'checked_in'
    | 'in_progress'
    | 'pending_checkout'
    | 'completed'
    | 'cancelled'
    | 'refund_pending'
    | 'refunded'

export interface PackageSnapshot {
  packageId: string
  name: string
  durationMinutes: number
  price: number
  rodCount: number
}

export interface TimeSlotSnapshot {
  slotId: string
  date: string
  startTime: string
  endTime: string
}

export interface Order {
  _id: string
  orderNo: string
  userId: string
  openid: string
  orderType: OrderType
  status: OrderStatus
  slotId: string
  packageId: string
  pricingRuleId?: string
  rodCount: number
  peopleCount: number
  packageSnapshot: PackageSnapshot
  slotSnapshot: TimeSlotSnapshot
  baseAmount: number
  goodsAmount: number
  adjustAmount: number
  discountAmount: number
  paidAmount: number
  finalAmount: number
  remark: string
  adminRemark: string
  checkinCode: string
  createdBy: string
  createdAt: Date | string
  updatedAt: Date | string
}

export interface CreateOrderParams {
  packageId: string
  slotId: string
  peopleCount: number
  rodCount: number
  remark?: string
}

export interface CreateOrderResult {
  orderId: string
  orderNo: string
  status: OrderStatus
}

export interface OrderDetailData {
  order: Order
  package?: ShrimpPackage
  timeSlot?: TimeSlot
  serverTime: string
}

export interface GetMyOrdersParams {
  status?: OrderStatus | 'all'
}

export interface MyOrdersData {
  rows: Order[]
  total: number
  serverTime: string
}

export interface CancelOrderParams {
  orderId: string
}

export interface CancelOrderResult {
  orderId: string
  status: Extract<OrderStatus, 'cancelled'>
}
