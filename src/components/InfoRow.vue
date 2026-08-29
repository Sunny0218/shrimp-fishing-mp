<script setup lang="ts">
const props = withDefaults(defineProps<{
  label: string
  value?: string | number
  variant?: 'default' | 'price' | 'muted' | 'code'
}>(), {
  value: '',
  variant: 'default',
})

const displayValue = computed(() => {
  if (props.value === '' || props.value === undefined || props.value === null) {
    return '-'
  }

  return props.value
})
</script>

<template>
  <view class="info-row">
    <text class="info-row__label">
      {{ label }}
    </text>
    <text class="info-row__value" :class="`info-row__value--${variant}`">
      <slot>{{ displayValue }}</slot>
    </text>
  </view>
</template>

<style scoped lang="scss">
.info-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  border-bottom: 2rpx solid #eef2ef;
  padding: 16rpx 0;

  &:last-child {
    border-bottom: none;
  }

  &__label {
    flex-shrink: 0;
    color: #718079;
    font-size: 26rpx;
    line-height: 1.4;
  }

  &__value {
    min-width: 0;
    color: #17211d;
    font-size: 26rpx;
    line-height: 1.4;
    text-align: right;
    word-break: break-all;

    &--price {
      color: #c9472b;
      font-size: 32rpx;
      font-weight: 700;
    }

    &--muted {
      color: #52615b;
    }

    &--code {
      font-size: 36rpx;
      font-weight: 700;
      letter-spacing: 4rpx;
    }
  }
}
</style>
