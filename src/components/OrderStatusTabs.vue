<script setup lang="ts">
export interface OrderStatusTabItem {
  label: string
  value: string
}

const props = withDefaults(defineProps<{
  tabs: OrderStatusTabItem[]
  active: string
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  change: [value: string]
}>()

function handleSelect(value: string) {
  if (props.disabled || props.active === value) {
    return
  }

  emit('change', value)
}
</script>

<template>
  <view class="order-status-tabs">
    <view
      v-for="tab in tabs"
      :key="tab.value"
      class="order-status-tabs__item"
      :class="{ 'order-status-tabs__item--active': active === tab.value }"
      @tap="handleSelect(tab.value)"
    >
      {{ tab.label }}
    </view>
  </view>
</template>

<style scoped lang="scss">
.order-status-tabs {
  display: flex;
  gap: 14rpx;
  overflow-x: auto;
  padding-bottom: 18rpx;
  white-space: nowrap;

  &__item {
    flex-shrink: 0;
    border-radius: 8rpx;
    background: #ffffff;
    padding: 14rpx 22rpx;
    color: #62716b;
    font-size: 25rpx;
    line-height: 1.2;

    &--active {
      background: #1f6b56;
      color: #ffffff;
      font-weight: 600;
    }
  }
}
</style>
