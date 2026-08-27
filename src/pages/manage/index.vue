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
const editRoles = ['admin', 'super_admin']
const canManage = computed(() => !!userInfo.value.role && manageRoles.includes(userInfo.value.role))
const canEditShop = computed(() => !!userInfo.value.role && editRoles.includes(userInfo.value.role))
const roleTextMap = {
  customer: '顾客',
  staff: '服务员',
  admin: '管理员',
  super_admin: '超级管理员',
}
const roleText = computed(() => roleTextMap[userInfo.value.role || 'customer'])

function handleOpenCheckin() {
  uni.navigateTo({
    url: '/pages/manage/checkin',
  })
}

function handleOpenTodayOrders() {
  uni.navigateTo({
    url: '/pages/manage/orders',
  })
}

function handleOpenPackages() {
  uni.navigateTo({
    url: '/pages/manage/packages',
  })
}

function handleOpenPricing() {
  uni.navigateTo({
    url: '/pages/manage/pricing',
  })
}

function handleOpenSettings() {
  if (!canEditShop.value) {
    uni.showToast({
      title: '仅管理员可维护门店信息',
      icon: 'none',
    })
    return
  }

  uni.navigateTo({
    url: '/pages/manage/settings',
  })
}

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
      <view class="text-5 text-[#17352f] font-600">
        门店管理
      </view>
      <view class="mt-2 text-3.5 text-[#6b7d78]">
        当前角色：{{ roleText }}
      </view>
    </view>

    <view class="grid grid-cols-2 mt-4 gap-3">
      <view class="manage-card manage-card--primary" @click="handleOpenCheckin">
        <view class="manage-card__title">
          开始计时
        </view>
        <view class="manage-card__desc">
          扫码或输入顾客出示的开始计时码
        </view>
      </view>
      <view class="manage-card" @click="handleOpenTodayOrders">
        <view class="manage-card__title">
          门店订单
        </view>
        <view class="manage-card__desc">
          按日期查看预约与进行中订单
        </view>
      </view>
      <view class="manage-card" @click="handleOpenCheckin">
        <view class="manage-card__title">
          开始计时
        </view>
        <view class="manage-card__desc">
          现场确认顾客订单并开始计时
        </view>
      </view>
      <view class="manage-card" @click="handleOpenPackages">
        <view class="manage-card__title">
          套餐管理
        </view>
        <view class="manage-card__desc">
          配置固定套餐价格
        </view>
      </view>
      <view class="manage-card" :class="{ 'manage-card--disabled': !canEditShop }" @click="handleOpenSettings">
        <view class="manage-card__title">
          门店信息
        </view>
        <view class="manage-card__desc">
          {{ canEditShop ? '维护首页展示和联系方式' : '仅管理员可维护' }}
        </view>
      </view>
      <view class="manage-card" @click="handleOpenPricing">
        <view class="manage-card__title">
          计费规则
        </view>
        <view class="manage-card__desc">
          配置首小时和续钟价格
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

  &--primary {
    background: #1f6b56;

    .manage-card__title {
      color: #ffffff;
    }

    .manage-card__desc {
      color: #dcebe3;
    }
  }

  &--disabled {
    opacity: 0.72;
  }

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
