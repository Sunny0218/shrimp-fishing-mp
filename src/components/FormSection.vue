<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <view class="form-section">
    <view class="form-section__header">
      <view class="form-section__title">
        {{ title }}
      </view>
      <slot name="action" />
    </view>
    <slot />
    <view v-if="$slots.actions" class="form-section__actions">
      <slot name="actions" />
    </view>
  </view>
</template>

<style scoped lang="scss">
.form-section {
  margin-top: 22rpx;
  border-radius: 8rpx;
  background: #ffffff;
  padding: 28rpx;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20rpx;
    margin-bottom: 22rpx;
  }

  &__title {
    color: #17211d;
    font-size: 31rpx;
    font-weight: 700;
    line-height: 1.3;
  }

  &__actions {
    margin-top: 28rpx;
  }
}
</style>
