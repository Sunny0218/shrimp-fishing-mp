<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  titleVariant?: 'default' | 'success'
  layout?: 'default' | 'split'
}>(), {
  title: '',
  titleVariant: 'default',
  layout: 'default',
})
</script>

<template>
  <view class="section-card" :class="`section-card--${layout}`">
    <view v-if="title || $slots.action" class="section-card__header">
      <view
        v-if="title"
        class="section-card__title"
        :class="`section-card__title--${titleVariant}`"
      >
        {{ title }}
      </view>
      <slot name="action" />
    </view>
    <slot />
  </view>
</template>

<style scoped lang="scss">
.section-card {
  box-sizing: border-box;
  width: 100%;
  margin-top: 24rpx;
  border-radius: 8rpx;
  background: #ffffff;
  padding: 28rpx;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);

  &--split {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24rpx;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20rpx;
    margin-bottom: 18rpx;
  }

  &__title {
    min-width: 0;
    color: #17211d;
    font-size: 32rpx;
    font-weight: 700;
    line-height: 1.25;

    &--success {
      color: #1f6b56;
      font-size: 34rpx;
    }
  }
}
</style>
