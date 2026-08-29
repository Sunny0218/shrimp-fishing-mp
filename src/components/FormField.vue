<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  help?: string
  compact?: boolean
}>(), {
  help: '',
  compact: false,
})
</script>

<template>
  <view class="form-field" :class="{ 'form-field--compact': compact }">
    <view class="form-field__label">
      {{ label }}
    </view>
    <slot />
    <view v-if="help" class="form-field__help">
      {{ help }}
    </view>
  </view>
</template>

<style scoped lang="scss">
.form-field {
  margin-top: 20rpx;

  &:first-child {
    margin-top: 0;
  }

  &--compact {
    margin-top: 0;
  }

  &__label {
    margin-bottom: 10rpx;
    color: #718079;
    font-size: 23rpx;
    line-height: 1.3;
  }

  &__help {
    margin-top: 10rpx;
    color: #84918c;
    font-size: 22rpx;
    line-height: 1.4;
  }
}
</style>
