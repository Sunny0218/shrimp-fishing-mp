<script setup lang="ts">
withDefaults(defineProps<{
  loading: boolean
  hasMore: boolean
  loadingText?: string
  moreText?: string
  doneText?: string
}>(), {
  loadingText: '加载中...',
  moreText: '上拉加载更多',
  doneText: '没有更多了',
})
</script>

<template>
  <view class="list-footer">
    {{ loading ? loadingText : hasMore ? moreText : doneText }}
  </view>
</template>

<style scoped lang="scss">
.list-footer {
  padding: 8rpx 0 4rpx;
  color: #8a9891;
  font-size: 24rpx;
  line-height: 1.4;
  text-align: center;
}
</style>
