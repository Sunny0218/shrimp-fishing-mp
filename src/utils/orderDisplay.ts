import type { Order } from '@/api/types/order'

export interface OrderTimeItem {
  label: string
  value: string
}

export function getDateTimeValue(value?: string | Date) {
  if (!value) {
    return 0
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime()
  }

  const time = new Date(value).getTime()

  return Number.isNaN(time) ? 0 : time
}

export function formatDateText(value?: string | Date | number) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (num: number) => `${num}`.padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function formatTimeText(value?: string | Date | number) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (num: number) => `${num}`.padStart(2, '0')

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDateTimeText(value?: string | Date | number) {
  const time = getDateTimeValue(value)

  if (!time) {
    return ''
  }

  return `${formatDateText(time)} ${formatTimeText(time)}`
}

function firstDateText(values: Array<string | Date | undefined>) {
  for (const value of values) {
    const dateText = formatDateText(value)

    if (dateText) {
      return dateText
    }
  }

  return ''
}

export function getOrderBusinessDateText(order: Order) {
  if (order.businessDate) {
    return order.businessDate
  }

  if (order.slotSnapshot?.date && ['pending_payment', 'paid'].includes(order.status)) {
    return order.slotSnapshot.date
  }

  if (['checked_in', 'in_progress'].includes(order.status)) {
    return firstDateText([order.startedAt, order.checkedInAt, order.createdAt])
  }

  if (order.status === 'pending_checkout') {
    return firstDateText([order.endedAt, order.finishedAt, order.startedAt, order.checkedInAt, order.createdAt])
  }

  if (order.status === 'completed') {
    return firstDateText([order.completedAt, order.finishedAt, order.endedAt, order.startedAt, order.checkedInAt, order.createdAt])
  }

  if (order.status === 'cancelled') {
    return firstDateText([order.cancelledAt, order.updatedAt, order.createdAt])
  }

  if (['refund_pending', 'refunded'].includes(order.status)) {
    return firstDateText([order.refundedAt, order.refundAt, order.updatedAt, order.createdAt])
  }

  if (order.slotSnapshot?.date) {
    return order.slotSnapshot.date
  }

  return firstDateText([order.createdAt, order.updatedAt])
}

export function getOrderExpectedEndedAtTime(order: Order) {
  const savedExpectedEndedAt = getDateTimeValue(order.expectedEndedAt)

  if (savedExpectedEndedAt) {
    return savedExpectedEndedAt
  }

  const startedAt = getDateTimeValue(order.startedAt || order.checkedInAt)
  const durationMinutes = order.packageSnapshot?.durationMinutes || 0

  if (!startedAt || durationMinutes <= 0) {
    return 0
  }

  return startedAt + durationMinutes * 60 * 1000
}

function createItem(label: string, value?: string) {
  if (!value) {
    return undefined
  }

  return {
    label,
    value,
  }
}

function getSlotTimeText(order: Order) {
  const slot = order.slotSnapshot

  if (!slot?.date) {
    return ''
  }

  return `${slot.date} ${slot.startTime}-${slot.endTime}`
}

function getStartedTimeText(order: Order) {
  const startedAt = getDateTimeValue(order.startedAt || order.checkedInAt)

  return startedAt ? formatDateTimeText(startedAt) : ''
}

function getExpectedEndTimeText(order: Order) {
  const expectedEndedAt = getOrderExpectedEndedAtTime(order)

  return expectedEndedAt ? formatDateTimeText(expectedEndedAt) : ''
}

function getFinishedTimeText(order: Order) {
  return formatDateTimeText(order.endedAt || order.finishedAt || order.completedAt)
}

function getCompletedTimeText(order: Order) {
  return formatDateTimeText(order.completedAt || order.finishedAt || order.endedAt)
}

export function getOrderTimeItems(order: Order): OrderTimeItem[] {
  const items: Array<OrderTimeItem | undefined> = []
  const slotTimeText = getSlotTimeText(order)
  const createdTimeText = formatDateTimeText(order.createdAt)

  if (['pending_payment', 'paid'].includes(order.status)) {
    items.push(
      createItem(slotTimeText ? '预约时间' : '下单时间', slotTimeText || createdTimeText),
      slotTimeText ? createItem('下单时间', createdTimeText) : undefined,
    )
  }
  else if (['checked_in', 'in_progress'].includes(order.status)) {
    items.push(
      createItem('开始时间', getStartedTimeText(order)),
      createItem('预计结束', getExpectedEndTimeText(order)),
    )
  }
  else if (order.status === 'pending_checkout') {
    items.push(
      createItem('开始时间', getStartedTimeText(order)),
      createItem('结束时间', getFinishedTimeText(order)),
    )
  }
  else if (order.status === 'completed') {
    items.push(
      createItem('开始时间', getStartedTimeText(order)),
      createItem('完成时间', getCompletedTimeText(order)),
    )
  }
  else if (order.status === 'cancelled') {
    items.push(
      createItem('取消时间', formatDateTimeText(order.cancelledAt || order.updatedAt)),
      createItem('下单时间', createdTimeText),
    )
  }
  else if (['refund_pending', 'refunded'].includes(order.status)) {
    items.push(
      createItem(order.status === 'refunded' ? '退款时间' : '退款申请', formatDateTimeText(order.refundedAt || order.refundAt || order.updatedAt)),
      createItem('下单时间', createdTimeText),
    )
  }
  else {
    items.push(
      createItem(slotTimeText ? '预约时间' : '下单时间', slotTimeText || createdTimeText),
    )
  }

  const result = items.filter((item): item is OrderTimeItem => !!item)

  return result.length ? result : [{ label: '安排方式', value: '到店后安排' }]
}

export function getOrderDisplayTime(order: Order) {
  const item = getOrderTimeItems(order)[0]

  return item ? `${item.label} ${item.value}` : '到店后安排'
}
