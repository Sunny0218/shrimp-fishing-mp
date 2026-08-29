<script setup lang="ts">
import ActionButton from './ActionButton.vue'
import type { OrderStatus } from '@/api/types/order'
import type { OrderTimeItem } from '@/utils/orderDisplay'

withDefaults(defineProps<{
  title: string
  status: OrderStatus
  statusText: string
  timeText?: string
  timeItems?: OrderTimeItem[]
  metaText: string
  orderNo: string
  dailyNo?: string
  priceText: string
  typeLabel?: string
  typeVariant?: 'package' | 'metered' | ''
  timerText?: string
  timerLevel?: 'normal' | 'warning' | 'overtime' | ''
  actionLabel?: string
  actionLoading?: boolean
  actionDisabled?: boolean
}>(), {
  timeText: '',
  timeItems: () => [],
  typeLabel: '',
  typeVariant: '',
  dailyNo: '',
  timerText: '',
  timerLevel: '',
  actionLabel: '',
  actionLoading: false,
  actionDisabled: false,
})

const emit = defineEmits<{
  click: []
  action: []
}>()
</script>

<template>
  <view class="order-card" @click="emit('click')">
    <view class="order-card__header">
      <view class="order-card__main">
        <view class="order-card__title">
          {{ title }}
        </view>
        <view
          v-if="typeLabel"
          class="order-card__type"
          :class="typeVariant ? `order-card__type--${typeVariant}` : ''"
        >
          {{ typeLabel }}
        </view>
      </view>
      <view class="order-card__aside">
        <view class="order-card__status" :class="`order-card__status--${status}`">
          {{ statusText }}
        </view>
        <view
          v-if="timerText"
          class="order-card__timer"
          :class="{
            'order-card__timer--warning': timerLevel === 'warning',
            'order-card__timer--overtime': timerLevel === 'overtime',
          }"
        >
          {{ timerText }}
        </view>
      </view>
    </view>

    <view v-if="timeItems.length" class="order-card__time-list">
      <view
        v-for="item in timeItems"
        :key="`${item.label}-${item.value}`"
        class="order-card__time-item"
      >
        <text class="order-card__time-label">
          {{ item.label }}
        </text>
        <text class="order-card__time-value">
          {{ item.value }}
        </text>
      </view>
    </view>
    <view v-else-if="timeText" class="order-card__line">
      {{ timeText }}
    </view>

    <view class="order-card__meta">
      {{ metaText }}
    </view>

    <view class="order-card__footer">
      <view class="order-card__no-wrap">
        <text v-if="dailyNo" class="order-card__daily-no">
          编号 {{ dailyNo }}
        </text>
        <text class="order-card__no">
          {{ dailyNo ? orderNo : `订单号 ${orderNo}` }}
        </text>
      </view>
      <text class="order-card__price">
        {{ priceText }}
      </text>
    </view>

    <view v-if="actionLabel" class="order-card__actions">
      <ActionButton
        class="order-card__action-btn"
        block
        size="small"
        :label="actionLabel"
        :loading="actionLoading"
        :disabled="actionDisabled"
        @click.stop="emit('action')"
      />
    </view>
  </view>
</template>

<style scoped lang="scss">
.order-card {
  border-radius: 8rpx;
  background: #ffffff;
  padding: 26rpx;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);

  &__header,
  &__footer {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20rpx;
  }

  &__main {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: 10rpx 12rpx;
  }

  &__title {
    min-width: 0;
    color: #17211d;
    font-size: 31rpx;
    font-weight: 700;
    line-height: 1.3;
  }

  &__type {
    flex-shrink: 0;
    border-radius: 8rpx;
    background: #f8f2df;
    padding: 6rpx 12rpx;
    color: #8a6a19;
    font-size: 21rpx;
    font-weight: 600;
    line-height: 1.2;

    &--metered {
      background: #e8f3ed;
      color: #1f6b56;
    }

    &--package {
      background: #f8f2df;
      color: #8a6a19;
    }
  }

  &__aside {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    align-items: flex-end;
    gap: 10rpx;
    max-width: 240rpx;
  }

  &__status {
    flex-shrink: 0;
    border-radius: 8rpx;
    background: #e8f3ed;
    padding: 8rpx 14rpx;
    color: #1f6b56;
    font-size: 22rpx;
    line-height: 1.2;

    &--in_progress {
      background: #f8f2df;
      color: #c9472b;
    }

    &--pending_checkout {
      background: #eef1f6;
      color: #43546c;
    }

    &--cancelled,
    &--refunded {
      background: #f0f2ef;
      color: #89938f;
    }
  }

  &__line,
  &__meta {
    margin-top: 16rpx;
    color: #718079;
    font-size: 25rpx;
    line-height: 1.4;
  }

  &__time-list {
    display: flex;
    flex-direction: column;
    gap: 10rpx;
    margin-top: 18rpx;
  }

  &__time-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18rpx;
    color: #718079;
    font-size: 24rpx;
    line-height: 1.35;
  }

  &__time-label {
    flex-shrink: 0;
    color: #89938f;
  }

  &__time-value {
    min-width: 0;
    color: #4f5f58;
    text-align: right;
  }

  &__timer {
    border-radius: 8rpx;
    background: #f8f2df;
    padding: 8rpx 12rpx;
    color: #c9472b;
    font-size: 24rpx;
    font-weight: 700;
    line-height: 1.2;
    text-align: right;

    &--warning {
      background: #fff3c8;
      color: #9b6b12;
    }

    &--overtime {
      background: #f7e5de;
    }
  }

  &__footer {
    margin-top: 22rpx;
    border-top: 2rpx solid #eef2ef;
    padding-top: 18rpx;
  }

  &__no-wrap {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }

  &__daily-no {
    color: #1f6b56;
    font-size: 26rpx;
    font-weight: 700;
    line-height: 1.25;
  }

  &__no {
    color: #89938f;
    font-size: 22rpx;
    line-height: 1.4;
  }

  &__price {
    flex-shrink: 0;
    color: #c9472b;
    font-size: 30rpx;
    font-weight: 700;
    line-height: 1.2;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 20rpx;
  }

  &__action-btn {
    min-width: 176rpx;
  }
}
</style>
