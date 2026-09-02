import type { PricingRule, ShrimpPackage, TimeSlot } from './home'

export interface CloudDateValue {
  $date?: string | number
  toDate?: () => Date
}

export type OrderDateValue = Date | string | CloudDateValue

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

export interface OrderReminderState {
  customerNearEndSentAt?: OrderDateValue
  customerEndedSentAt?: OrderDateValue
  staffNearEndSentAt?: OrderDateValue
  staffEndedSentAt?: OrderDateValue
  customerPendingCheckoutSentAt?: OrderDateValue
  staffPendingCheckoutSentAt?: OrderDateValue
  customerCompletedSentAt?: OrderDateValue
}

export type RodSessionStatus = 'pending' | 'in_progress' | 'stopped' | 'completed'

export interface RodSessionSegment {
  startedAt: OrderDateValue
  stoppedAt?: OrderDateValue | null
  actualDurationMinutes?: number
}

export interface RodSession {
  id: string
  label: string
  status: RodSessionStatus
  startedAt?: OrderDateValue
  stoppedAt?: OrderDateValue
  endedAt?: OrderDateValue
  segments?: RodSessionSegment[]
  actualDurationMinutes?: number
  chargedMinutes?: number
  amount?: number
  paidAmount?: number
  checkoutAmount?: number
}

export interface Order {
  _id: string
  orderNo: string
  dailyNo?: string
  dailySequence?: number
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
  rodSessions?: RodSession[]
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
  cancelReason?: string
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
  reminders?: OrderReminderState
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
  dailyNo?: string
  status: OrderStatus
  bookedCount?: number
  slotStatus?: string
  payment?: PaymentRecord
}

export interface CreateWalkInOrderParams {
  customerPhone?: string
  rodCount: number
  remark?: string
}

export interface CreateWalkInOrderResult {
  orderId: string
  orderNo: string
  dailyNo?: string
  status: Extract<OrderStatus, 'pending_payment' | 'paid'>
  checkinCode?: string
  pricingRule: PricingRule
  payment?: PaymentRecord | null
}

export interface OrderDetailData {
  order: Order
  package?: ShrimpPackage
  timeSlot?: TimeSlot
  activePricingRule?: PricingRule | null
  notificationStatus?: {
    customer?: {
      hasAvailable: boolean
      templateKeys: string[]
    }
  }
  serverTime: string
}

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface PaginationData {
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

export interface GetMyOrdersParams extends PaginationParams {
  status?: OrderStatus | 'all'
}

export interface MyOrdersData extends PaginationData {
  rows: Order[]
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
  refundPending: number
  refunded: number
}

export interface GetOrdersParams extends PaginationParams {
  status?: ManageOrderStatusFilter
  date?: string
  startDate?: string
  endDate?: string
}

export interface OrdersData extends PaginationData {
  rows: Order[]
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

export type UpdateRodSessionAction = 'stop' | 'resume'

export interface UpdateRodSessionParams {
  orderId: string
  rodSessionId: string
  action: UpdateRodSessionAction
}

export interface UpdateRodSessionResult {
  order: Order
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

export interface OperationLog {
  _id: string
  orderId: string
  orderNo: string
  action: string
  actionText: string
  operatorType: 'staff' | 'customer' | string
  operatorUserId: string
  operatorOpenid: string
  operatorRole: string
  operatorName: string
  payload: Record<string, unknown>
  createdAt?: OrderDateValue
}

export interface GetOperationLogsParams {
  orderId: string
  limit?: number
}

export interface OperationLogsData {
  rows: OperationLog[]
  total: number
  serverTime: string
}
