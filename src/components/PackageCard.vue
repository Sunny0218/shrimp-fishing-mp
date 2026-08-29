<script setup lang="ts">
import type { ShrimpPackage } from '@/api/types/home'
import StatusBadge from '@/components/StatusBadge.vue'

const props = withDefaults(defineProps<{
  packageItem: ShrimpPackage
  mode?: 'home' | 'select' | 'manage'
  selected?: boolean
  showDescription?: boolean
  showStatus?: boolean
  showPeople?: boolean
  showSort?: boolean
}>(), {
  mode: 'home',
  selected: false,
  showDescription: true,
  showStatus: false,
  showPeople: true,
  showSort: false,
})

const emit = defineEmits<{
  click: [packageItem: ShrimpPackage]
}>()

const statusText = computed(() => props.packageItem.status === 'active' ? '启用' : '停用')
const statusVariant = computed(() => props.packageItem.status === 'active' ? 'success' : 'neutral')
const fallbackDescription = computed(() => props.mode === 'manage' ? '暂无描述' : '门店精选套餐')
const metaItems = computed(() => {
  const items = [
    formatDuration(props.packageItem.durationMinutes),
    `${props.packageItem.rodCount} 支杆`,
  ]

  if (props.showPeople) {
    items.push(`建议 ${props.packageItem.maxPeople} 人`)
  }

  if (props.showSort) {
    items.push(`排序 ${props.packageItem.sort || 0}`)
  }

  return items
})

function formatPrice(price: number) {
  return `¥${(price / 100).toFixed(0)}`
}

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes}分钟`
  }

  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60

  return restMinutes ? `${hours}小时${restMinutes}分钟` : `${hours}小时`
}

function handleClick() {
  emit('click', props.packageItem)
}
</script>

<template>
  <view
    class="package-card"
    :class="[
      `package-card--${mode}`,
      { 'package-card--selected': selected },
    ]"
    @click="handleClick"
  >
    <view class="package-card__body">
      <view class="package-card__header">
        <view class="package-card__name">
          {{ packageItem.name }}
        </view>
        <StatusBadge v-if="showStatus" :text="statusText" :variant="statusVariant" />
      </view>

      <view v-if="showDescription" class="package-card__desc">
        {{ packageItem.description || fallbackDescription }}
      </view>

      <view class="package-card__meta" :class="`package-card__meta--${mode}`">
        <text v-for="item in metaItems" :key="item">
          {{ item }}
        </text>
      </view>
    </view>

    <view class="package-card__side">
      <view class="package-card__price">
        {{ formatPrice(packageItem.price) }}
      </view>
      <slot name="actions" />
    </view>
  </view>
</template>

<style scoped lang="scss">
.package-card {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  box-sizing: border-box;
  gap: 20rpx;
  width: 100%;
  border: 2rpx solid transparent;
  border-radius: 8rpx;
  background: #ffffff;
  padding: 24rpx;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);

  &--home {
    min-height: 188rpx;
  }

  &--select {
    align-items: center;
  }

  &--manage {
    flex-direction: column;
    padding: 26rpx;
  }

  &--selected {
    border-color: #1f6b56;
  }

  &__body {
    min-width: 0;
    flex: 1;
  }

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20rpx;
  }

  &__name {
    min-width: 0;
    color: #17211d;
    font-size: 31rpx;
    font-weight: 700;
    line-height: 1.3;
  }

  &--home &__name {
    font-size: 32rpx;
    line-height: 1.25;
  }

  &--select &__name {
    font-size: 30rpx;
    line-height: 1.25;
  }

  &__desc {
    margin-top: 12rpx;
    color: #5c6b65;
    font-size: 25rpx;
    line-height: 1.45;
  }

  &--manage &__desc {
    margin-top: 14rpx;
    color: #718079;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10rpx;
    margin-top: 16rpx;
    color: #8a6f28;
    font-size: 24rpx;
    line-height: 1.35;

    &--select {
      margin-top: 10rpx;
      color: #6c7a74;
    }

    &--manage {
      margin-top: 18rpx;
      color: #52615b;
      font-size: 23rpx;

      text {
        border-radius: 8rpx;
        background: #eef4f0;
        padding: 8rpx 12rpx;
      }
    }
  }

  &__side {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: space-between;
    gap: 18rpx;
  }

  &--home &__side {
    width: 152rpx;
  }

  &--select &__side {
    justify-content: center;
  }

  &--manage &__side {
    width: 100%;
    flex-direction: row;
    align-items: center;
    border-top: 2rpx solid #eef2ef;
    padding-top: 18rpx;
  }

  &__price {
    flex-shrink: 0;
    color: #c9472b;
    font-size: 34rpx;
    font-weight: 700;
    line-height: 1.2;
  }

  &--home &__price {
    font-size: 38rpx;
  }

  &--manage &__price {
    font-size: 32rpx;
  }
}
</style>
