<script setup lang="ts">
type ActionButtonVariant = 'primary' | 'secondary' | 'ghost' | 'warning' | 'danger' | 'danger-solid' | 'danger-outline' | 'outline-light'
type ActionButtonSize = 'small' | 'medium' | 'large'

const props = withDefaults(defineProps<{
  label: string
  loading?: boolean
  loadingText?: string
  disabled?: boolean
  variant?: ActionButtonVariant
  size?: ActionButtonSize
  block?: boolean
}>(), {
  loading: false,
  loadingText: '处理中...',
  disabled: false,
  variant: 'primary',
  size: 'medium',
  block: false,
})

const emit = defineEmits<{
  tap: [event: unknown]
}>()

function handleClick(event: unknown) {
  const stoppableEvent = event as { stopPropagation?: () => void }
  stoppableEvent.stopPropagation?.()

  if (props.disabled || props.loading) {
    return
  }

  emit('tap', event)
}
</script>

<template>
  <button
    class="action-button"
    :class="[
      `action-button--${variant}`,
      `action-button--${size}`,
      { 'action-button--block': block },
    ]"
    :disabled="disabled || loading"
    @tap.stop="handleClick"
  >
    {{ loading ? loadingText : label }}
  </button>
</template>

<style scoped lang="scss">
.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: auto;
  border: 2rpx solid transparent;
  border-radius: 8rpx;
  padding: 0 24rpx;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;

  &--small {
    min-width: 108rpx;
    min-height: 58rpx;
    font-size: 24rpx;
  }

  &--medium {
    min-width: 180rpx;
    min-height: 66rpx;
    font-size: 25rpx;
  }

  &--large {
    min-height: 76rpx;
    font-size: 28rpx;
  }

  &--block {
    display: flex;
    width: 100%;
  }

  &--primary {
    background: #1f6b56;
    color: #ffffff;
  }

  &--secondary {
    background: #f6c453;
    color: #20312b;
  }

  &--ghost {
    background: #eef4f0;
    color: #1f6b56;
  }

  &--warning {
    background: #f7eee2;
    color: #9b5d16;
  }

  &--danger {
    background: #f8ebe7;
    color: #c9472b;
  }

  &--danger-solid {
    background: #c9472b;
    color: #ffffff;
  }

  &--danger-outline {
    border-color: #e8d0c7;
    background: #ffffff;
    color: #c9472b;
  }

  &--outline-light {
    border-color: rgb(255 255 255 / 45%);
    background: transparent;
    color: #ffffff;
  }

  &[disabled] {
    opacity: 0.55;
  }
}

button::after {
  border: none;
}
</style>
