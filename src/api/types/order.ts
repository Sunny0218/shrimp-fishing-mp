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
  maxPeople?: number
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
  bookingMode?: 'walk_in' | 'slot'
  businessDate?: string
  slotId?: string
  packageId: string
  pricingRuleId?: string
  rodCount: number
  peopleCount: number
  packageSnapshot: PackageSnapshot
  slotSnapshot?: TimeSlotSnapshot
  baseAmount: number
  goodsAmount: number
  adjustAmount: number
  discountAmount: number
  overtimeAmount?: number
  checkoutAmount?: number
  checkoutPaidAmount?: number
  checkoutPaidAt?: Date | string
  waivedOvertimeAmount?: number
  paidAmount: number
  finalAmount: number
  remark: string
  adminRemark: string
  checkinCode: string
  checkedInAt?: Date | string
  startedAt?: Date | string
  expectedEndedAt?: Date | string
  endedAt?: Date | string
  actualDurationMinutes?: number
  overtimeMinutes?: number
  chargedOvertimeMinutes?: number
  waiverReason?: string
  earlyFinishedMinutes?: number
  earlyFinishReason?: string
  finishedBy?: string
  finishedAt?: Date | string
  completedAt?: Date | string
  cancelledAt?: Date | string
  refundedAt?: Date | string
  refundAt?: Date | string
  checkedInBy?: string
  createdBy: string
  createdAt: Date | string
  updatedAt: Date | string
}

export interface CreateOrderParams {
  packageId: string
  slotId?: string
  peopleCount?: number
  rodCount?: number
  remark?: string
}

export interface CreateOrderResult {
  orderId: string
  orderNo: string
  status: OrderStatus
  bookedCount?: number
  slotStatus?: string
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

export type ManageOrderStatusFilter = OrderStatus | 'active' | 'all'

export interface ManageOrderSummary {
  all: number
  active: number
  paid: number
  inProgress: number
  pendingCheckout: number
  completed: number
  cancelled: number
}

export interface GetOrdersParams {
  status?: ManageOrderStatusFilter
  date?: string
  startDate?: string
  endDate?: string
}

export interface OrdersData {
  rows: Order[]
  total: number
  summary: ManageOrderSummary
  date: string
  startDate?: string
  endDate?: string
  serverTime: string
}

export interface CancelOrderParams {
  orderId: string
}

export interface CancelOrderResult {
  orderId: string
  status: Extract<OrderStatus, 'cancelled'>
}

export interface CheckInOrderParams {
  orderId?: string
  checkinCode: string
}

export interface CheckInOrderResult {
  order: Order
  checkedInAt: string
}

export interface FinishTimingOrderParams {
  orderId: string
  waiveOvertime?: boolean
  waiverReason?: string
  earlyFinishReason?: string
  reason?: string
}

export interface FinishTimingOrderResult {
  order: Order
  logSaved?: boolean
}

export interface PayCheckoutOrderParams {
  orderId: string
}

export interface CheckoutPayment {
  _id: string
  paymentNo: string
  amount: number
  type: 'checkout'
  status: 'paid'
  paidAt: Date | string
}

export interface PayCheckoutOrderResult {
  order: Order
  payment: CheckoutPayment
}
