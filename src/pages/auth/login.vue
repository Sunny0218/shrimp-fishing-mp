<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { bindWechatPhoneNumber } from '@/api/login'
import ActionButton from '@/components/ActionButton.vue'
import { useUserStore } from '@/store'
import { useTokenStore } from '@/store/token'
import { isPageTabbar } from '@/tabbar/store'

definePage({
  style: {
    navigationBarTitleText: '登录',
  },
})

const tokenStore = useTokenStore()
const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)
const logging = ref(false)
const redirectUrl = ref('')

const displayName = computed(() => userInfo.value.nickname || userInfo.value.username || '微信用户')
const avatarUrl = computed(() => userInfo.value.avatar || userInfo.value.avatarUrl || '/static/images/default-avatar.png')

interface GetPhoneNumberEvent {
  detail: {
    errMsg: string
    code?: string
  }
}

function goAfterLogin() {
  const targetUrl = redirectUrl.value

  if (targetUrl) {
    if (isPageTabbar(targetUrl)) {
      uni.switchTab({ url: targetUrl })
    }
    else {
      uni.redirectTo({ url: targetUrl })
    }
    return
  }

  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
    return
  }

  uni.switchTab({
    url: '/pages/me/me',
  })
}

async function handleWechatLogin() {
  if (logging.value) {
    return
  }

  if (tokenStore.hasLogin) {
    goAfterLogin()
    return
  }

  logging.value = true

  try {
    // #ifdef MP-WEIXIN
    await tokenStore.wxLogin()
    // #endif

    // #ifndef MP-WEIXIN
    await tokenStore.login({
      username: '钓虾用户',
      password: '123456',
    })
    // #endif

    goAfterLogin()
  }
  catch (error) {
    const title = error instanceof Error ? error.message : '登录失败，请重试'
    uni.showToast({
      title,
      icon: 'none',
    })
  }
  finally {
    logging.value = false
  }
}

async function handlePhoneLogin(event: GetPhoneNumberEvent) {
  if (logging.value) {
    return
  }

  console.info('[auth/login] getPhoneNumber detail:', event.detail)

  const phoneCode = event.detail.code

  if (!phoneCode) {
    uni.showToast({
      title: '未授权手机号，可先用微信登录',
      icon: 'none',
    })
    return
  }

  logging.value = true

  try {
    if (!tokenStore.hasLogin) {
      await tokenStore.wxLogin({ silent: true })
    }

    const user = await bindWechatPhoneNumber({
      code: phoneCode,
    })
    console.info('[auth/login] bindPhoneNumber success:', {
      _id: user._id,
      openid: user.openid,
      phone: user.phone,
      countryCode: user.countryCode,
    })
    userStore.setUserInfo(user)

    uni.showToast({
      title: '登录成功',
      icon: 'success',
    })
    goAfterLogin()
  }
  catch (error) {
    console.error('[auth/login] bindPhoneNumber failed:', error)
    const title = error instanceof Error ? error.message : '登录失败，请重试'
    uni.showToast({
      title,
      icon: 'none',
    })
  }
  finally {
    logging.value = false
  }
}

onLoad((query) => {
  redirectUrl.value = typeof query?.redirect === 'string' ? decodeURIComponent(query.redirect) : ''

  if (tokenStore.hasLogin) {
    goAfterLogin()
  }
})
</script>

<template>
  <view class="login-page">
    <view class="login-page__hero">
      <image class="login-page__avatar" :src="avatarUrl" mode="aspectFill" />
      <view class="login-page__title">
        欢迎来到钓虾乐园
      </view>
      <view class="login-page__subtitle">
        登录后可以预约场次、查看订单和出示核销码
      </view>
    </view>

    <view class="login-card">
      <view class="login-card__title">
        微信授权登录
      </view>
      <view class="login-card__desc">
        推荐授权手机号，方便门店联系和核对订单；也可以先用微信身份登录，之后再补绑手机号。
      </view>
      <!-- #ifdef MP-WEIXIN -->
      <ActionButton
        class="login-card__button"
        open-type="getPhoneNumber"
        block
        :label="logging ? '登录中...' : '手机号授权登录'"
        :disabled="logging"
        @getphonenumber="handlePhoneLogin"
      />
      <ActionButton
        class="login-card__secondary-button"
        label="微信登录，暂不绑定手机号"
        block
        variant="ghost"
        :disabled="logging"
        @click="handleWechatLogin"
      />
      <!-- #endif -->
      <!-- #ifndef MP-WEIXIN -->
      <ActionButton
        class="login-card__button"
        block
        :label="logging ? '登录中...' : '登录'"
        :disabled="logging"
        @click="handleWechatLogin"
      />
      <!-- #endif -->
      <view v-if="tokenStore.hasLogin" class="login-card__tip">
        当前已登录：{{ displayName }}
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  background: #f4f7f2;
  padding: 56rpx 28rpx 40rpx;
  color: #17211d;

  &__hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 42rpx 20rpx 30rpx;
    text-align: center;
  }

  &__avatar {
    width: 128rpx;
    height: 128rpx;
    border: 6rpx solid #ffffff;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 12rpx 30rpx rgb(31 59 50 / 10%);
  }

  &__title {
    margin-top: 28rpx;
    color: #17211d;
    font-size: 44rpx;
    font-weight: 700;
    line-height: 1.2;
  }

  &__subtitle {
    margin-top: 16rpx;
    color: #65756f;
    font-size: 26rpx;
    line-height: 1.5;
  }
}

.login-card {
  margin-top: 28rpx;
  border-radius: 8rpx;
  background: #ffffff;
  padding: 34rpx 28rpx;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);

  &__title {
    color: #17211d;
    font-size: 34rpx;
    font-weight: 700;
    line-height: 1.25;
  }

  &__desc {
    margin-top: 14rpx;
    color: #65756f;
    font-size: 26rpx;
    line-height: 1.55;
  }

  &__button {
    display: block;
    margin-top: 34rpx;
    font-size: 30rpx;
    min-height: 82rpx;
    width: 100%;
  }

  &__secondary-button {
    display: block;
    margin-top: 18rpx;
    min-height: 76rpx;
    width: 100%;
    font-size: 28rpx;
  }

  &__tip {
    margin-top: 20rpx;
    color: #718079;
    font-size: 24rpx;
    line-height: 1.4;
    text-align: center;
  }
}
</style>
