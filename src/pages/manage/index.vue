<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/store'

definePage({
  style: {
    navigationBarTitleText: '门店管理',
  },
})

const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)
const manageRoles = ['staff', 'admin', 'super_admin']
const canManage = computed(() => !!userInfo.value.role && manageRoles.includes(userInfo.value.role))

onLoad(() => {
  if (canManage.value) {
    return
  }

  uni.showToast({
    title: '无权限访问',
    icon: 'none',
  })

  setTimeout(() => {
    uni.navigateBack()
  }, 800)
})
</script>

<template>
  <view class="min-h-screen bg-[#f5f7f6] px-4 py-5">
    <view class="rounded-2 bg-white p-4 shadow-sm">
      <view class="text-5 font-600 text-[#17352f]">
        门店管理
      </view>
      <view class="mt-2 text-3.5 text-[#6b7d78]">
        当前角色：{{ userInfo.role || 'customer' }}
      </view>
    </view>

    <view class="mt-4 grid grid-cols-2 gap-3">
      <view class="manage-card">
        <view class="manage-card__title">
          今日订单
        </view>
        <view class="manage-card__desc">
          查看预约与进行中订单
        </view>
      </view>
      <view class="manage-card">
        <view class="manage-card__title">
          现场开单
        </view>
        <view class="manage-card__desc">
          按杆数创建实时计费订单
        </view>
      </view>
      <view class="manage-card">
        <view class="manage-card__title">
          套餐管理
        </view>
        <view class="manage-card__desc">
          配置固定套餐价格
        </view>
      </view>
      <view class="manage-card">
        <view class="manage-card__title">
          计费规则
        </view>
        <view class="manage-card__desc">
          配置阶梯计费价格
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.manage-card {
  min-height: 180rpx;
  border-radius: 8rpx;
  background: #fff;
  padding: 28rpx;
  box-shadow: 0 8rpx 24rpx rgb(24 54 47 / 6%);

  &__title {
    color: #17352f;
    font-size: 32rpx;
    font-weight: 600;
  }

  &__desc {
    margin-top: 16rpx;
    color: #73827e;
    font-size: 24rpx;
    line-height: 1.45;
  }
}
</style>
