<script setup lang="ts">
withDefaults(defineProps<{
  text: string
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  size?: 'small' | 'medium'
}>(), {
  variant: 'success',
  size: 'small',
})
</script>

<template>
  <view class="status-badge" :class="[`status-badge--${variant}`, `status-badge--${size}`]">
    {{ text }}
  </view>
</template>

<style scoped lang="scss">
.status-badge {
  flex-shrink: 0;
  width: fit-content;
  border-radius: 8rpx;
  line-height: 1.2;
  white-space: nowrap;

  &--small {
    padding: 8rpx 14rpx;
    font-size: 22rpx;
  }

  &--medium {
    padding: 8rpx 16rpx;
    font-size: 24rpx;
  }

  &--success {
    background: #e8f3ed;
    color: #1f6b56;
  }

  &--warning {
    background: #f8f2df;
    color: #c9472b;
  }

  &--danger {
    background: #fbe7df;
    color: #c9472b;
  }

  &--info {
    background: #eef1f6;
    color: #43546c;
  }

  &--neutral {
    background: #f0f2ef;
    color: #89938f;
  }
}
</style>
