<script setup lang="ts">
withDefaults(defineProps<{
  tag?: string
  title?: string
  description?: string
  size?: 'medium' | 'large'
  variant?: 'dark' | 'plain'
  align?: 'left' | 'center'
}>(), {
  tag: '',
  title: '',
  description: '',
  size: 'large',
  variant: 'dark',
  align: 'left',
})
</script>

<template>
  <view class="page-hero" :class="[`page-hero--${size}`, `page-hero--${variant}`, `page-hero--${align}`]">
    <view v-if="$slots.media" class="page-hero__media">
      <slot name="media" />
    </view>

    <view v-if="$slots.header" class="page-hero__header">
      <slot name="header" />
    </view>

    <view v-if="tag || $slots.tag" class="page-hero__tag">
      <slot name="tag">
        {{ tag }}
      </slot>
    </view>

    <view
      v-if="title || description || $slots.meta || $slots.aside"
      class="page-hero__body"
      :class="{ 'page-hero__body--with-aside': $slots.aside }"
    >
      <view class="page-hero__main">
        <view v-if="title" class="page-hero__title">
          {{ title }}
        </view>

        <view v-if="description" class="page-hero__desc">
          {{ description }}
        </view>

        <view v-if="$slots.meta" class="page-hero__meta">
          <slot name="meta" />
        </view>
      </view>

      <view v-if="$slots.aside" class="page-hero__aside">
        <slot name="aside" />
      </view>
    </view>

    <view v-if="$slots.extra" class="page-hero__extra">
      <slot name="extra" />
    </view>
  </view>
</template>

<style scoped lang="scss">
.page-hero {
  box-sizing: border-box;
  width: 100%;
  border-radius: 8rpx;
  padding: 36rpx 28rpx;

  &--medium {
    padding: 34rpx 28rpx;
  }

  &--dark {
    background: #163b32;
    box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);
  }

  &--plain {
    background: transparent;
    box-shadow: none;
  }

  &--center {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  &__media {
    display: flex;
    justify-content: center;
  }

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20rpx;
  }

  &__tag {
    width: fit-content;
    border-radius: 8rpx;
    background: #f6c453;
    padding: 8rpx 14rpx;
    color: #20312b;
    font-size: 22rpx;
    line-height: 1.2;
  }

  &--medium &__tag {
    font-size: 23rpx;
  }

  &__header + &__tag {
    margin-top: 24rpx;
  }

  &__body {
    min-width: 0;

    &--with-aside {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24rpx;
    }
  }

  &__media + &__body,
  &__header + &__body,
  &__tag + &__body {
    margin-top: 28rpx;
  }

  &--medium &__header + &__body,
  &--medium &__tag + &__body {
    margin-top: 26rpx;
  }

  &__main {
    min-width: 0;
    flex: 1;
  }

  &__aside {
    flex-shrink: 0;
    max-width: 44%;
  }

  &__title {
    font-size: 44rpx;
    font-weight: 700;
    line-height: 1.2;
  }

  &--dark &__title {
    color: #ffffff;
  }

  &--plain &__title {
    color: #17211d;
  }

  &--medium &__title {
    font-size: 40rpx;
    line-height: 1.25;
  }

  &__desc {
    margin-top: 12rpx;
    font-size: 26rpx;
    line-height: 1.4;
  }

  &--dark &__desc {
    color: #f5ead8;
  }

  &--plain &__desc {
    color: #65756f;
  }

  &--medium &__desc {
    margin-top: 14rpx;
    color: #dcebe3;
    line-height: 1.5;
  }

  &__meta {
    margin-top: 18rpx;
  }

  &__extra {
    margin-top: 20rpx;
  }
}
</style>
