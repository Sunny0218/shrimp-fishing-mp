<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import ActionButton from '@/components/ActionButton.vue'
import { updateUserProfile } from '@/api/user'
import { LOGIN_PAGE } from '@/router/config'
import { useUserStore } from '@/store'
import { useTokenStore } from '@/store/token'
import { getRoleText, hasRole, manageRoles } from '@/utils/roles'

definePage({
  style: {
    navigationBarTitleText: '我的',
  },
})

const userStore = useUserStore()
const tokenStore = useTokenStore()
// 使用storeToRefs解构userInfo
const { userInfo } = storeToRefs(userStore)
const canEnterManage = computed(() => hasRole(userInfo.value.role, manageRoles))
const loggingOut = ref(false)
const editingNickname = ref(false)
const savingNickname = ref(false)
const nicknameInput = ref('')
const maxNicknameLength = 20

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
const roleText = computed(() => getRoleText(userInfo.value.role))
const normalizedNicknameInput = computed(() => nicknameInput.value.trim())
const canSaveNickname = computed(() => {
  return !!normalizedNicknameInput.value
    && normalizedNicknameInput.value !== (userInfo.value.nickname || '').trim()
    && !savingNickname.value
})

function handleStartEditNickname() {
  nicknameInput.value = userInfo.value.nickname || ''
  editingNickname.value = true
}

function handleCancelEditNickname() {
  if (savingNickname.value) {
    return
  }

  editingNickname.value = false
  nicknameInput.value = ''
}

async function handleSaveNickname() {
  if (!canSaveNickname.value) {
    return
  }

  if (normalizedNicknameInput.value.length > maxNicknameLength) {
    uni.showToast({
      title: `昵称不能超过 ${maxNicknameLength} 个字符`,
      icon: 'none',
    })
    return
  }

  savingNickname.value = true

  try {
    const result = await updateUserProfile({
      nickname: normalizedNicknameInput.value,
    })

    userStore.setUserInfo({
      ...userInfo.value,
      ...result.user,
    })
    editingNickname.value = false
    nicknameInput.value = ''
    uni.showToast({
      title: '昵称已更新',
      icon: 'success',
    })
  }
  catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '昵称修改失败',
      icon: 'none',
    })
  }
  finally {
    savingNickname.value = false
  }
}
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
      <ActionButton v-if="!tokenStore.hasLogin" class="profile-card__login" label="登录" block variant="secondary" size="small" @click="handleLogin" />
      <ActionButton v-else class="profile-card__edit" label="改昵称" variant="outline-light" size="small" @click="handleStartEditNickname" />
    </view>

    <view v-if="tokenStore.hasLogin && editingNickname" class="nickname-panel">
      <view class="nickname-panel__header">
        修改昵称
      </view>
      <input
        v-model="nicknameInput"
        class="nickname-panel__input"
        type="nickname"
        placeholder="请输入昵称"
        :maxlength="maxNicknameLength"
      >
      <view class="nickname-panel__actions">
        <ActionButton label="取消" variant="ghost" size="medium" :disabled="savingNickname" @click="handleCancelEditNickname" />
        <ActionButton label="保存昵称" loading-text="保存中" variant="secondary" size="medium" :loading="savingNickname" :disabled="!canSaveNickname" @click="handleSaveNickname" />
      </view>
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
      <ActionButton class="profile-page__logout" block label="退出登录" loading-text="退出中..." :loading="loggingOut" variant="danger-outline" size="large" @click="handleLogout" />
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
    font-size: 24rpx;
  }

  &__edit {
    flex-shrink: 0;
  }
}

.nickname-panel {
  margin-top: 24rpx;
  border-radius: 8rpx;
  background: #ffffff;
  padding: 28rpx;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);

  &__header {
    color: #17211d;
    font-size: 28rpx;
    font-weight: 700;
    line-height: 1.3;
  }

  &__input {
    box-sizing: border-box;
    width: 100%;
    height: 76rpx;
    margin-top: 20rpx;
    border: 2rpx solid #e2ebe6;
    border-radius: 8rpx;
    background: #ffffff;
    padding: 0 22rpx;
    color: #17211d;
    font-size: 26rpx;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 18rpx;
    margin-top: 24rpx;
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
</style>
