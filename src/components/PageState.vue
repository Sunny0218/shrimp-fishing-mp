<script setup lang="ts">
type PageStateVariant = 'default' | 'error' | 'inner'

withDefaults(defineProps<{
  text: string
  buttonText?: string
  variant?: PageStateVariant
}>(), {
  buttonText: '',
  variant: 'default',
})

const emit = defineEmits<{
  action: []
}>()
</script>

<template>
  <view class="page-state" :class="`page-state--${variant}`">
    <text>{{ text }}</text>
    <button v-if="buttonText" class="page-state__btn" @click="emit('action')">
      {{ buttonText }}
    </button>
  </view>
</template>

<style scoped lang="scss">
.page-state {
  border-radius: 8rpx;
  background: #ffffff;
  padding: 44rpx 28rpx;
  color: #718079;
  font-size: 26rpx;
  line-height: 1.4;
  text-align: center;

  &--error {
    color: #c9472b;
  }

  &--inner {
    box-shadow: none;
    background: #f7faf8;
  }

  &__btn {
    width: auto;
    min-width: 180rpx;
    min-height: 66rpx;
    margin-top: 24rpx;
    border-radius: 8rpx;
    background: #1f6b56;
    padding: 0 24rpx;
    color: #ffffff;
    font-size: 25rpx;
    line-height: 66rpx;
    white-space: nowrap;
  }
}

button::after {
  border: none;
}
</style>
