import type { NotificationTemplateKey } from '@/config/notificationTemplates'

export type NotificationTarget = 'customer' | 'staff'
export type NotificationSubscribeStatus = 'accept' | 'reject' | 'ban' | 'filter'
export type NotificationEventType
  = | 'customer_paid'
    | 'customer_started'
    | 'customer_ended'
    | 'customer_pending_checkout'
    | 'customer_completed'
    | 'customer_refunded'

export interface SaveNotificationSubscriptionItem {
  templateKey: NotificationTemplateKey
  templateId: string
  status: NotificationSubscribeStatus
  target: NotificationTarget
  eventType?: NotificationEventType
}

export interface SaveNotificationSubscriptionParams {
  target: NotificationTarget
  orderId?: string
  eventType?: NotificationEventType
  subscriptions: SaveNotificationSubscriptionItem[]
}

export interface SaveNotificationSubscriptionResult {
  acceptedCount: number
  rejectedCount: number
  acceptedTemplateKeys: NotificationTemplateKey[]
  rejectedTemplateKeys: NotificationTemplateKey[]
  acceptedEventTypes?: NotificationEventType[]
  rejectedEventTypes?: NotificationEventType[]
}
