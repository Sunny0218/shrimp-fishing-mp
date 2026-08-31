<script setup lang="ts">
import { storeToRefs } from 'pinia'
import ManageCard from '@/components/ManageCard.vue'
import { useUserStore } from '@/store'
import { getRoleText, hasRole, manageRoles, roleManageRoles, shopEditRoles } from '@/utils/roles'

definePage({
  style: {
    navigationBarTitleText: '门店管理',
  },
})

const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)
const canManage = computed(() => hasRole(userInfo.value.role, manageRoles))
const canEditShop = computed(() => hasRole(userInfo.value.role, shopEditRoles))
const canManageRoles = computed(() => hasRole(userInfo.value.role, roleManageRoles))
const roleText = computed(() => getRoleText(userInfo.value.role))

function handleOpenCheckin(scene: 'package' | 'metered') {
  uni.navigateTo({
    url: `/pages/manage/checkin?scene=${scene}`,
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
      title: '仅超级管理员可维护门店信息',
      icon: 'none',
    })
    return
  }

  uni.navigateTo({
    url: '/pages/manage/settings',
  })
}

function handleOpenUsers() {
  if (!canManageRoles.value) {
    uni.showToast({
      title: '仅超级管理员可管理角色',
      icon: 'none',
    })
    return
  }

  uni.navigateTo({
    url: '/pages/manage/users',
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
      <ManageCard title="套餐核销" description="扫码或输入预约套餐核销码" @click="handleOpenCheckin('package')" />
      <ManageCard title="门店订单" description="按日期查看预约与进行中订单" accent="warning" @click="handleOpenTodayOrders" />
      <ManageCard title="到店计时" description="现场确认顾客订单并开始计时" @click="handleOpenCheckin('metered')" />
      <ManageCard title="套餐管理" description="配置固定套餐价格" accent="warning" @click="handleOpenPackages" />
      <ManageCard title="门店信息" :description="canEditShop ? '维护首页展示和联系方式' : '仅超级管理员可维护'" :muted="!canEditShop" @click="handleOpenSettings" />
      <ManageCard title="计费规则" description="配置首小时和续钟价格" accent="warning" @click="handleOpenPricing" />
      <ManageCard title="员工角色" :description="canManageRoles ? '设置员工和管理员权限' : '仅超级管理员可管理'" :muted="!canManageRoles" @click="handleOpenUsers" />
    </view>
  </view>
</template>
