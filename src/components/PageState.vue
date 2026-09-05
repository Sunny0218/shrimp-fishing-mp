<script setup lang="ts">
import ActionButton from './ActionButton.vue'

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
    <ActionButton v-if="buttonText" class="page-state__btn" :label="buttonText" @tap="emit('action')" />
  </view>
</template>

<style scoped lang="scss">
.page-state {
  display: flex;
  flex-direction: column;
  align-items: center;
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
    margin-top: 24rpx;
  }
}
</style>
