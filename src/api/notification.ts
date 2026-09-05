import type { CloudFunctionResponse } from './types/home'
import type { NotificationEventType, NotificationSubscribeStatus, NotificationTarget, SaveNotificationSubscriptionResult } from './types/notification'
import type { NotificationTemplateKey } from '@/config/notificationTemplates'
import { assertLogin, resolveCloudResponse } from './authGuard'
import { callCloudFunction } from '@/cloud'
import { activeOrderNotificationTemplateKeys, notificationTemplateConfig, notificationTemplateKeys } from '@/config/notificationTemplates'

export async function requestNotificationSubscription(target: NotificationTarget, options: { orderId?: string, eventType?: NotificationEventType, templateKeys?: NotificationTemplateKey[] } = {}) {
  assertLogin('请先登录后订阅提醒')
  const safeTemplateKeys = normalizeTemplateKeys(options.templateKeys)
  const tmplIds = safeTemplateKeys.map(templateKey => notificationTemplateConfig[templateKey].templateId)

  if (!tmplIds.length) {
    throw new Error('暂无可订阅的消息模板')
  }

  // #ifdef MP-WEIXIN
  const subscribeRes = await requestSubscribeMessage(tmplIds)
  const subscriptions = safeTemplateKeys.map(templateKey => ({
    templateKey,
    templateId: notificationTemplateConfig[templateKey].templateId,
    target,
    ...(options.eventType ? { eventType: options.eventType } : {}),
    status: normalizeSubscribeStatus(subscribeRes[notificationTemplateConfig[templateKey].templateId]),
  }))
  const res = await callCloudFunction<CloudFunctionResponse<SaveNotificationSubscriptionResult>, Record<string, unknown>>(
    'saveNotificationSubscription',
    {
      target,
      ...(options.orderId ? { orderId: options.orderId.trim() } : {}),
      ...(options.eventType ? { eventType: options.eventType } : {}),
      subscriptions,
    },
  )

  return resolveCloudResponse(res, '订阅记录保存失败')
  // #endif

  throw new Error('当前平台暂不支持订阅消息')
}

async function requestSubscribeMessage(tmplIds: string[]) {
  try {
    return await wx.requestSubscribeMessage({
      tmplIds,
    })
  }
  catch (error) {
    throw new Error(getSubscribeMessageErrorText(error))
  }
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

function getSubscribeMessageErrorText(error: unknown) {
  const message = error && typeof error === 'object' && 'errMsg' in error
    ? String((error as { errMsg?: unknown }).errMsg || '')
    : error instanceof Error ? error.message : String(error || '')

  if (message.includes('can only be invoked by user TAP gesture')) {
    return '订阅失败：请点击订阅按钮后直接授权'
  }

  if (message.includes('main switch switched off')) {
    return '订阅失败：请在微信设置中开启订阅消息'
  }

  if (message.includes('template') || message.includes('tmpl')) {
    return '订阅失败：订阅模板配置异常'
  }

  if (message.includes('cancel')) {
    return '已取消订阅授权'
  }

  return message || '订阅授权失败'
}
