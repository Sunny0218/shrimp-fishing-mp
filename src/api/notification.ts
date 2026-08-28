import type { CloudFunctionResponse } from './types/home'
import type { NotificationSubscribeStatus, NotificationTarget, SaveNotificationSubscriptionResult } from './types/notification'
import type { NotificationTemplateKey } from '@/config/notificationTemplates'
import { assertLogin, resolveCloudResponse } from './authGuard'
import { callCloudFunction } from '@/cloud'
import { activeOrderNotificationTemplateKeys, notificationTemplateConfig, notificationTemplateKeys } from '@/config/notificationTemplates'

export async function requestNotificationSubscription(target: NotificationTarget, options: { orderId?: string, templateKeys?: NotificationTemplateKey[] } = {}) {
  assertLogin('请先登录后订阅提醒')
  const safeTemplateKeys = normalizeTemplateKeys(options.templateKeys)
  const tmplIds = safeTemplateKeys.map(templateKey => notificationTemplateConfig[templateKey].templateId)

  // #ifdef MP-WEIXIN
  const subscribeRes = await wx.requestSubscribeMessage({
    tmplIds,
  })
  const subscriptions = safeTemplateKeys.map(templateKey => ({
    templateKey,
    templateId: notificationTemplateConfig[templateKey].templateId,
    target,
    status: normalizeSubscribeStatus(subscribeRes[notificationTemplateConfig[templateKey].templateId]),
  }))
  const res = await callCloudFunction<CloudFunctionResponse<SaveNotificationSubscriptionResult>, Record<string, unknown>>(
    'saveNotificationSubscription',
    {
      target,
      ...(options.orderId ? { orderId: options.orderId.trim() } : {}),
      subscriptions,
    },
  )

  return resolveCloudResponse(res, '订阅记录保存失败')
  // #endif

  throw new Error('当前平台暂不支持订阅消息')
}

function normalizeTemplateKeys(templateKeys?: NotificationTemplateKey[]) {
  const keys = templateKeys?.length ? templateKeys : activeOrderNotificationTemplateKeys
  const uniqueKeys = keys.filter((templateKey, index, list) => notificationTemplateKeys.includes(templateKey) && list.indexOf(templateKey) === index)

  return uniqueKeys.length ? uniqueKeys : activeOrderNotificationTemplateKeys
}

function normalizeSubscribeStatus(value: unknown): NotificationSubscribeStatus {
  if (value === 'accept' || value === 'reject' || value === 'ban' || value === 'filter') {
    return value
  }

  return 'reject'
}
