export const notificationTemplateConfig = {
  reservationNotice: {
    templateId: '8O7iDjllM5Yi1TBFTaxwwubW9kuNbr77rtbOQnjeaSc',
    title: '预约通知',
    scene: 'reservation_notice',
    fields: {
      customerName: 'name1',
      appointmentTime: 'date3',
      appointmentItem: 'thing13',
      appointmentStatus: 'phrase14',
      remark: 'thing8',
    },
  },
  orderStatus: {
    templateId: 'swMnYem-qmhfPYmL94qIfrFb2Kfws1xT2hjgsN37Pso',
    title: '订单状态提醒',
    scene: 'order_status',
    fields: {
      orderNo: 'character_string6',
      orderStatus: 'phrase2',
      orderAmount: 'amount40',
      updatedAt: 'time20',
      remark: 'thing5',
    },
  },
} as const

export const defaultNotificationSettings = {
  customerEnabled: true,
  staffEnabled: true,
  reminderBeforeMinutes: 10,
  templates: notificationTemplateConfig,
}

export type NotificationTemplateKey = keyof typeof notificationTemplateConfig

export const notificationTemplateIds = Object.values(notificationTemplateConfig).map(item => item.templateId)

export const notificationTemplateKeys = Object.keys(notificationTemplateConfig) as NotificationTemplateKey[]

export const activeOrderNotificationTemplateKeys: NotificationTemplateKey[] = ['orderStatus']

export const activeOrderNotificationTemplateIds = activeOrderNotificationTemplateKeys.map(templateKey => notificationTemplateConfig[templateKey].templateId)
