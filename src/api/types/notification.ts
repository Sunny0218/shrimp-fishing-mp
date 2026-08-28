import type { NotificationTemplateKey } from '@/config/notificationTemplates'

export type NotificationTarget = 'customer' | 'staff'
export type NotificationSubscribeStatus = 'accept' | 'reject' | 'ban' | 'filter'

export interface SaveNotificationSubscriptionItem {
  templateKey: NotificationTemplateKey
  templateId: string
  status: NotificationSubscribeStatus
  target: NotificationTarget
}

export interface SaveNotificationSubscriptionParams {
  target: NotificationTarget
  orderId?: string
  subscriptions: SaveNotificationSubscriptionItem[]
}

export interface SaveNotificationSubscriptionResult {
  acceptedCount: number
  rejectedCount: number
  acceptedTemplateKeys: NotificationTemplateKey[]
  rejectedTemplateKeys: NotificationTemplateKey[]
}
