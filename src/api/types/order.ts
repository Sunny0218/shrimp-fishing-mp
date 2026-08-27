import type { PricingRule, ShrimpPackage, TimeSlot } from './home'

export interface CloudDateValue {
  $date?: string | number
  toDate?: () => Date
}

export type OrderDateValue = Date | string | number | CloudDateValue

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

export interface PricingRuleSnapshot {
  pricingRuleId: string
  name: string
  pricePerHour: number
  firstHourAmount?: number
  extraPricePerHour?: number
  minimumMinutes: number
  unitMinutes: number
}

export interface Order {
  _id: string
  orderNo: string
  userId: string
  openid: string
  orderType: OrderType
  orderSource?: 'booking' | 'walk_in'
  status: OrderStatus
  bookingMode?: 'walk_in' | 'slot'
  businessDate?: string
  slotId?: string
  packageId: string
  pricingRuleId?: string
  rodCount: number
  peopleCount: number
  customerPhone?: string
  packageSnapshot?: PackageSnapshot
  pricingRuleSnapshot?: PricingRuleSnapshot
  slotSnapshot?: TimeSlotSnapshot
  baseAmount: number
  goodsAmount: number
  adjustAmount: number
  discountAmount: number
  overtimeAmount?: number
  checkoutAmount?: number
  checkoutPaidAmount?: number
  checkoutPaidAt?: OrderDateValue
  waivedOvertimeAmount?: number
  refundAmount?: number
  refundNo?: string
  refundStatus?: 'pending' | 'refunded' | string
  refundReason?: string
  paidAmount: number
  finalAmount: number
  remark: string
  adminRemark: string
  checkinCode: string
  checkedInAt?: OrderDateValue
  paymentExpiredAt?: OrderDateValue
  startedAt?: OrderDateValue
  expectedEndedAt?: OrderDateValue
  endedAt?: OrderDateValue
  actualDurationMinutes?: number
  overtimeMinutes?: number
  chargedOvertimeMinutes?: number
  chargedMeteredMinutes?: number
  waiverReason?: string
  earlyFinishedMinutes?: number
  earlyFinishReason?: string
  finishedBy?: string
  finishedAt?: OrderDateValue
  completedAt?: OrderDateValue
  cancelledAt?: OrderDateValue
  refundedAt?: OrderDateValue
  refundAt?: OrderDateValue
  checkedInBy?: string
  createdBy: string
  createdAt: OrderDateValue
  updatedAt: OrderDateValue
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
  payment?: PaymentRecord
}

export interface CreateWalkInOrderParams {
  customerPhone?: string
  remark?: string
}

export interface CreateWalkInOrderResult {
  orderId: string
  orderNo: string
  status: Extract<OrderStatus, 'paid'>
  checkinCode: string
  pricingRule: PricingRule
}

export interface OrderDetailData {
  order: Order
  package?: ShrimpPackage
  timeSlot?: TimeSlot
  activePricingRule?: PricingRule | null
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
  activePricingRule?: PricingRule | null
  serverTime: string
}

export interface CancelOrderParams {
  orderId: string
}

export interface CancelOrderResult {
  orderId: string
  status: Extract<OrderStatus, 'cancelled' | 'refunded'>
  refundAmount?: number
  refundNo?: string
}

export interface PayOrderParams {
  orderId: string
}

export interface PayOrderResult {
  order: Order
  payment: PaymentRecord
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

export type PaymentType = 'order' | 'checkout' | 'refund'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

export interface PaymentRecord {
  _id: string
  paymentNo: string
  amount: number
  type: PaymentType
  checkoutType?: 'metered_checkout' | 'overtime_checkout'
  status: PaymentStatus
  paidAt?: Date | string
  refundedAt?: Date | string
  refundNo?: string
}

export interface PayCheckoutOrderResult {
  order: Order
  payment: PaymentRecord
}
