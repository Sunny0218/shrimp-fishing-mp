import type { CloudFunctionResponse } from './types/home'
import type { ManagePricingRulesData, SavePricingRuleParams, SavePricingRuleResult, UpdatePricingRuleStatusParams, UpdatePricingRuleStatusResult } from './types/pricing'
import { assertLogin, resolveCloudResponse } from './authGuard'
import { callCloudFunction } from '@/cloud'

export async function getManagePricingRules() {
  assertLogin('请先登录后管理计费规则')

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<ManagePricingRulesData>>('getManagePricingRules')

  return resolveCloudResponse(res, '计费规则获取失败')
  // #endif

  return {
    rows: [],
    total: 0,
    canEdit: false,
    serverTime: new Date().toISOString(),
  }
}

export async function savePricingRule(params: SavePricingRuleParams) {
  assertLogin('请先登录后保存计费规则')

  const requestParams: SavePricingRuleParams = {
    ...(params.pricingRuleId ? { pricingRuleId: params.pricingRuleId.trim() } : {}),
    name: params.name.trim(),
    description: params.description.trim(),
    pricePerHour: params.pricePerHour,
    firstHourAmount: params.firstHourAmount,
    extraPricePerHour: params.extraPricePerHour,
    minimumMinutes: params.minimumMinutes,
    unitMinutes: params.unitMinutes,
    status: params.status,
    sort: params.sort,
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<SavePricingRuleResult>, Record<string, unknown>>(
    'savePricingRule',
    { ...requestParams },
  )

  return resolveCloudResponse(res, '计费规则保存失败')
  // #endif

  throw new Error('当前平台暂不支持保存计费规则')
}

export async function updatePricingRuleStatus(params: UpdatePricingRuleStatusParams) {
  assertLogin('请先登录后调整计费规则')

  const pricingRuleId = params.pricingRuleId.trim()

  if (!pricingRuleId) {
    throw new Error('缺少计费规则 ID')
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<UpdatePricingRuleStatusResult>, Record<string, unknown>>(
    'updatePricingRuleStatus',
    {
      pricingRuleId,
      status: params.status,
    },
  )

  return resolveCloudResponse(res, '计费规则状态调整失败')
  // #endif

  throw new Error('当前平台暂不支持调整计费规则')
}
