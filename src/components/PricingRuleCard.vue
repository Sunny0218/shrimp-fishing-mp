<script setup lang="ts">
import type { PricingRule } from '@/api/types/home'
import StatusBadge from '@/components/StatusBadge.vue'

const props = withDefaults(defineProps<{
  rule: PricingRule
  mode?: 'summary' | 'manage'
  showStatus?: boolean
  showSort?: boolean
  showPrepaid?: boolean
  prepaidAmount?: number
}>(), {
  mode: 'summary',
  showStatus: false,
  showSort: false,
  showPrepaid: false,
  prepaidAmount: 0,
})

const statusText = computed(() => props.rule.status === 'active' ? '启用中' : '停用')
const statusVariant = computed(() => props.rule.status === 'active' ? 'success' : 'neutral')
const firstHourAmount = computed(() => props.rule.firstHourAmount || props.rule.pricePerHour || 0)
const extraPricePerHour = computed(() => props.rule.extraPricePerHour || props.rule.pricePerHour || 0)
const metaItems = computed(() => {
  const items = [
    `最低 ${formatDuration(props.rule.minimumMinutes)}`,
    `按 ${formatDuration(props.rule.unitMinutes)} 计费`,
  ]

  if (props.showSort) {
    items.push(`排序 ${props.rule.sort || 0}`)
  }

  return items
})
const summaryMetaText = computed(() => metaItems.value.join(' · '))

function formatPrice(price?: number) {
  return `¥${((price || 0) / 100).toFixed(0)}`
}

function formatDuration(minutes?: number) {
  const duration = minutes || 0

  if (duration < 60) {
    return `${duration}分钟`
  }

  const hours = Math.floor(duration / 60)
  const restMinutes = duration % 60

  return restMinutes ? `${hours}小时${restMinutes}分钟` : `${hours}小时`
}
</script>

<template>
  <view class="pricing-rule-card" :class="`pricing-rule-card--${mode}`">
    <view class="pricing-rule-card__header">
      <view class="pricing-rule-card__name">
        {{ rule.name }}
      </view>
      <StatusBadge v-if="showStatus" :text="statusText" :variant="statusVariant" />
    </view>

    <view class="pricing-rule-card__desc">
      {{ rule.description || (mode === 'summary' ? '从服务员确认开始计时时计算' : '暂无描述') }}
    </view>

    <view class="pricing-rule-card__price">
      首小时 {{ formatPrice(firstHourAmount) }}
      <text class="pricing-rule-card__price-sub">
        续钟 {{ formatPrice(extraPricePerHour) }}/小时
      </text>
    </view>

    <view v-if="mode === 'summary'" class="pricing-rule-card__meta pricing-rule-card__meta--summary">
      {{ summaryMetaText }}
    </view>
    <view v-else class="pricing-rule-card__meta pricing-rule-card__meta--manage">
      <text v-for="item in metaItems" :key="item">
        {{ item }}
      </text>
    </view>

    <view v-if="showPrepaid" class="pricing-rule-card__prepaid">
      首小时预付 {{ formatPrice(prepaidAmount) }}
    </view>

    <view v-if="$slots.actions" class="pricing-rule-card__actions">
      <slot name="actions" />
    </view>
  </view>
</template>

<style scoped lang="scss">
.pricing-rule-card {
  box-sizing: border-box;
  width: 100%;
  border-radius: 8rpx;
  background: #ffffff;
  padding: 26rpx;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);

  &--summary {
    border: 2rpx solid #e5eee9;
    background: #fbfcfb;
    padding: 22rpx;
    box-shadow: none;
  }

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20rpx;
  }

  &__name {
    min-width: 0;
    color: #17211d;
    font-size: 31rpx;
    font-weight: 700;
    line-height: 1.3;
  }

  &--summary &__name {
    font-size: 30rpx;
  }

  &__desc {
    margin-top: 14rpx;
    color: #718079;
    font-size: 25rpx;
    line-height: 1.45;
  }

  &--summary &__desc {
    margin-top: 12rpx;
    font-size: 24rpx;
    line-height: 1.4;
  }

  &__price {
    margin-top: 18rpx;
    color: #c9472b;
    font-size: 34rpx;
    font-weight: 700;
    line-height: 1.2;
  }

  &--summary &__price {
    margin-top: 22rpx;
    font-size: 38rpx;
  }

  &__price-sub {
    display: block;
    margin-top: 8rpx;
    color: #8a6a19;
    font-size: 24rpx;
    font-weight: 600;
  }

  &--summary &__price-sub {
    margin-top: 10rpx;
    font-size: 25rpx;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10rpx;
    margin-top: 18rpx;
    color: #52615b;
    font-size: 23rpx;
    line-height: 1.35;

    text {
      border-radius: 8rpx;
      background: #eef4f0;
      padding: 8rpx 12rpx;
    }

    &--summary {
      margin-top: 12rpx;
      color: #8a6a19;
      font-size: 24rpx;
      line-height: 1.4;
    }

    &--manage {
      text {
        border-radius: 8rpx;
        background: #eef4f0;
        padding: 8rpx 12rpx;
      }
    }
  }

  &__prepaid {
    margin-top: 18rpx;
    border-radius: 8rpx;
    background: #fff7df;
    padding: 16rpx 18rpx;
    color: #c9472b;
    font-size: 25rpx;
    font-weight: 700;
    line-height: 1.35;
  }

  &__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12rpx;
    margin-top: 22rpx;
    border-top: 2rpx solid #eef2ef;
    padding-top: 18rpx;

    :deep(.action-button) {
      width: auto;
      min-width: 108rpx;
    }
  }
}
</style>
