<script setup lang="ts">
withDefaults(defineProps<{
  tag?: string
  title?: string
  description?: string
  size?: 'medium' | 'large' | 'hero'
  variant?: 'dark' | 'plain' | 'image'
  align?: 'left' | 'center'
  tagVariant?: 'gold' | 'dark'
  fullBleed?: boolean
}>(), {
  tag: '',
  title: '',
  description: '',
  size: 'large',
  variant: 'dark',
  align: 'left',
  tagVariant: 'gold',
  fullBleed: false,
})
</script>

<template>
  <view
    class="page-hero"
    :class="[
      `page-hero--${size}`,
      `page-hero--${variant}`,
      `page-hero--${align}`,
      { 'page-hero--full-bleed': fullBleed },
    ]"
  >
    <view v-if="$slots.background" class="page-hero__background">
      <slot name="background" />
    </view>

    <view v-if="variant === 'image'" class="page-hero__overlay" />

    <view class="page-hero__content">
      <view v-if="$slots.media" class="page-hero__media">
        <slot name="media" />
      </view>

      <view v-if="$slots.header" class="page-hero__header">
        <slot name="header" />
      </view>

      <view v-if="tag || $slots.tag" class="page-hero__tag" :class="`page-hero__tag--${tagVariant}`">
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
  </view>
</template>

<style scoped lang="scss">
.page-hero {
  box-sizing: border-box;
  position: relative;
  width: 100%;
  border-radius: 8rpx;
  padding: 36rpx 28rpx;

  &--medium {
    padding: 34rpx 28rpx;
  }

  &--hero {
    padding: calc(var(--status-bar-height) + 72rpx) 28rpx 38rpx;
  }

  &--full-bleed {
    margin: 0 -28rpx;
    border-radius: 0;
  }

  &--dark {
    background: #163b32;
    box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);
  }

  &--plain {
    background: transparent;
    box-shadow: none;
  }

  &--image {
    overflow: hidden;
    background: linear-gradient(135deg, #133b32 0%, #1f6b56 58%, #c9472b 100%);
  }

  &--center {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  &__background,
  &__overlay {
    position: absolute;
    inset: 0;
  }

  &__background {
    z-index: 0;
  }

  &__overlay {
    z-index: 1;
    background: linear-gradient(180deg, rgb(0 0 0 / 8%) 0%, rgb(0 0 0 / 44%) 48%, rgb(0 0 0 / 72%) 100%);
  }

  &__content {
    position: relative;
    z-index: 2;
  }

  &--hero &__content {
    min-height: 420rpx;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
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

  &__tag--dark {
    background: rgb(23 33 29 / 36%);
    color: #ffffff;
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

  &--hero &__title {
    color: #ffffff;
    font-size: 56rpx;
    line-height: 1.15;
    text-shadow: 0 4rpx 14rpx rgb(0 0 0 / 35%);
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

  &--hero &__desc {
    margin-top: 20rpx;
    color: #f5ead8;
    font-size: 28rpx;
    line-height: 1.5;
    text-shadow: 0 3rpx 10rpx rgb(0 0 0 / 32%);
  }

  &__meta {
    margin-top: 18rpx;
  }

  &--hero &__meta {
    margin-top: 12rpx;
  }

  &__extra {
    margin-top: 20rpx;
  }

  &--hero &__extra {
    margin-top: 36rpx;
  }
}
</style>
