<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description: string
  accent?: 'primary' | 'warning'
  muted?: boolean
}>(), {
  accent: 'primary',
  muted: false,
})

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <view
    class="manage-card"
    :class="[`manage-card--${accent}`, { 'manage-card--muted': muted }]"
    @click="emit('click')"
  >
    <view class="manage-card__title">
      {{ title }}
    </view>
    <view class="manage-card__desc">
      {{ description }}
    </view>
  </view>
</template>

<style scoped lang="scss">
.manage-card {
  position: relative;
  overflow: hidden;
  min-height: 180rpx;
  border: 2rpx solid #edf3ef;
  border-radius: 8rpx;
  background: linear-gradient(135deg, #ffffff 0%, #fbfdfb 100%);
  padding: 28rpx;
  box-shadow: 0 8rpx 24rpx rgb(24 54 47 / 6%);

  &::before {
    position: absolute;
    top: 24rpx;
    left: 0;
    width: 8rpx;
    height: 44rpx;
    border-radius: 0 8rpx 8rpx 0;
    background: #1f6b56;
    content: '';
  }

  &:active {
    background: #eef6f2;
  }

  &--warning::before {
    background: #f6c453;
  }

  &--muted {
    opacity: 0.72;
  }

  &__title {
    color: #17352f;
    font-size: 32rpx;
    font-weight: 600;
    line-height: 1.25;
  }

  &__desc {
    margin-top: 16rpx;
    color: #73827e;
    font-size: 24rpx;
    line-height: 1.45;
  }
}
</style>
