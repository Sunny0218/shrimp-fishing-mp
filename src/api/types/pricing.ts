import type { PricingRule } from './home'

export type PricingRuleStatus = 'active' | 'disabled'

export interface ManagePricingRulesData {
  rows: PricingRule[]
  total: number
  canEdit: boolean
  canToggleStatus?: boolean
  serverTime: string
}

export interface SavePricingRuleParams {
  pricingRuleId?: string
  name: string
  description: string
  pricePerHour: number
  firstHourAmount: number
  extraPricePerHour: number
  minimumMinutes: number
  unitMinutes: number
  status: PricingRuleStatus
  sort: number
}

export interface SavePricingRuleResult {
  pricingRule: PricingRule
}

export interface UpdatePricingRuleStatusParams {
  pricingRuleId: string
  status: PricingRuleStatus
}

export interface UpdatePricingRuleStatusResult {
  pricingRule: PricingRule
}
