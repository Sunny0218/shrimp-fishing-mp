<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { LOGIN_PAGE } from '@/router/config'
import { useUserStore } from '@/store'
import { useTokenStore } from '@/store/token'

definePage({
  style: {
    navigationBarTitleText: '我的',
  },
})

const userStore = useUserStore()
const tokenStore = useTokenStore()
// 使用storeToRefs解构userInfo
const { userInfo } = storeToRefs(userStore)
const manageRoles = ['staff', 'admin', 'super_admin']
const canEnterManage = computed(() => !!userInfo.value.role && manageRoles.includes(userInfo.value.role))
const loggingOut = ref(false)

// 微信小程序下登录
async function handleLogin() {
  uni.navigateTo({
    url: `${LOGIN_PAGE}`,
  })
}

function handleLogout() {
  if (loggingOut.value) {
    return
  }

  uni.showModal({
    title: '提示',
    content: '确定要退出登录吗？',
    success: async (res) => {
      if (res.confirm) {
        loggingOut.value = true
        try {
          await tokenStore.logout()
          uni.showToast({
            title: '退出登录成功',
            icon: 'success',
          })
        }
        finally {
          loggingOut.value = false
        }
        // #ifdef MP-WEIXIN
        // 微信小程序，去首页
        // uni.reLaunch({ url: '/pages/index/index' })
        // #endif
        // #ifndef MP-WEIXIN
        // 非微信小程序，去登录页
        // uni.navigateTo({ url: LOGIN_PAGE })
        // #endif
      }
    },
  })
}

function handleEnterManage() {
  uni.switchTab({
    url: '/pages/manage/index',
  })
}

function handleEnterOrders() {
  if (!tokenStore.hasLogin) {
    uni.navigateTo({
      url: `${LOGIN_PAGE}?redirect=${encodeURIComponent('/pages/orders/index')}`,
    })
    return
  }

  uni.switchTab({
    url: '/pages/orders/index',
  })
}

const displayName = computed(() => userInfo.value.nickname || userInfo.value.username || '微信用户')
const avatarUrl = computed(() => userInfo.value.avatar || userInfo.value.avatarUrl || '/static/images/default-avatar.png')
const roleTextMap = {
  customer: '顾客',
  staff: '服务员',
  admin: '管理员',
  super_admin: '超级管理员',
}
const roleText = computed(() => roleTextMap[userInfo.value.role || 'customer'])
</script>

<template>
  <view class="profile-page">
    <view class="profile-card">
      <image class="profile-card__avatar" :src="avatarUrl" mode="aspectFill" />
      <view class="profile-card__content">
        <view class="profile-card__name">
          {{ tokenStore.hasLogin ? displayName : '未登录' }}
        </view>
        <view class="profile-card__desc">
          {{ tokenStore.hasLogin ? roleText : '登录后查看预约、订单和核销码' }}
        </view>
      </view>
      <button v-if="!tokenStore.hasLogin" class="profile-card__login" @click="handleLogin">
        登录
      </button>
    </view>

    <view class="profile-section">
      <view class="profile-section__title">
        我的服务
      </view>
      <view class="menu-list">
        <view class="menu-item" @click="handleEnterOrders">
          <view>
            <view class="menu-item__title">
              我的订单
            </view>
            <view class="menu-item__desc">
              查看预约、核销码和订单状态
            </view>
          </view>
          <text class="menu-item__arrow">
            ›
          </text>
        </view>
      </view>
    </view>

    <view v-if="canEnterManage" class="profile-section">
      <view class="profile-section__title">
        门店工作台
      </view>
      <view class="menu-list">
        <view class="menu-item" @click="handleEnterManage">
          <view>
            <view class="menu-item__title">
              门店管理
            </view>
            <view class="menu-item__desc">
              处理订单、核销和现场开单
            </view>
          </view>
          <text class="menu-item__arrow">
            ›
          </text>
        </view>
      </view>
    </view>

    <view v-if="tokenStore.hasLogin" class="profile-page__footer">
      <button class="profile-page__logout" :disabled="loggingOut" @click="handleLogout">
        {{ loggingOut ? '退出中...' : '退出登录' }}
      </button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.profile-page {
  min-height: 100vh;
  background: #f4f7f2;
  padding: 32rpx 28rpx 48rpx;
  color: #17211d;

  &__footer {
    margin-top: 40rpx;
  }

  &__logout {
    min-height: 76rpx;
    border-radius: 8rpx;
    border: 2rpx solid #e8d0c7;
    background: #ffffff;
    color: #c9472b;
    font-size: 28rpx;
    line-height: 76rpx;
  }
}

.profile-card {
  display: flex;
  align-items: center;
  gap: 22rpx;
  border-radius: 8rpx;
  background: #163b32;
  padding: 32rpx 28rpx;

  &__avatar {
    width: 112rpx;
    height: 112rpx;
    flex-shrink: 0;
    border: 4rpx solid rgb(255 255 255 / 80%);
    border-radius: 50%;
    background: #ffffff;
  }

  &__content {
    min-width: 0;
    flex: 1;
  }

  &__name {
    color: #ffffff;
    font-size: 34rpx;
    font-weight: 700;
    line-height: 1.25;
  }

  &__desc {
    margin-top: 10rpx;
    color: #f5ead8;
    font-size: 24rpx;
    line-height: 1.4;
  }

  &__login {
    width: 136rpx;
    min-height: 60rpx;
    flex-shrink: 0;
    border-radius: 8rpx;
    background: #f6c453;
    color: #20312b;
    font-size: 24rpx;
    line-height: 60rpx;
  }
}

.profile-section {
  margin-top: 28rpx;

  &__title {
    margin-bottom: 16rpx;
    color: #17211d;
    font-size: 30rpx;
    font-weight: 700;
    line-height: 1.25;
  }
}

.menu-list {
  overflow: hidden;
  border-radius: 8rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  padding: 28rpx;
  border-bottom: 2rpx solid #eef2ef;

  &:last-child {
    border-bottom: none;
  }

  &__title {
    color: #17211d;
    font-size: 28rpx;
    font-weight: 700;
    line-height: 1.3;
  }

  &__desc {
    margin-top: 8rpx;
    color: #718079;
    font-size: 24rpx;
    line-height: 1.4;
  }

  &__arrow {
    flex-shrink: 0;
    color: #a9b3af;
    font-size: 32rpx;
    line-height: 1;
  }
}

button::after {
  border: none;
}
</style>
