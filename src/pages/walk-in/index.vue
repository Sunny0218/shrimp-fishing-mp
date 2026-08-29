<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue'
import PricingRuleCard from '@/components/PricingRuleCard.vue'
import type { HomeData } from '@/api/types/home'
import { defaultHomeData, getHomeData } from '@/api/home'
import { createWalkInOrder } from '@/api/order'
import { useTokenStore } from '@/store'

definePage({
  style: {
    navigationBarTitleText: '现场开单',
    enablePullDownRefresh: true,
  },
})

const homeData = ref<HomeData>({ ...defaultHomeData })
const customerPhone = ref('')
const rodCount = ref(1)
const remark = ref('')
const loading = ref(false)
const submitting = ref(false)
const errorText = ref('')
const tokenStore = useTokenStore()
const pricingRule = computed(() => homeData.value.pricingRule)
const isLoggedIn = computed(() => tokenStore.hasLogin)
const prepaidAmount = computed(() => getFirstHourAmount() * rodCount.value)
const submitText = computed(() => {
  if (!isLoggedIn.value) {
    return '去登录'
  }

  return submitting.value ? '开单中...' : '确认开单'
})

async function fetchData() {
  loading.value = true
  errorText.value = ''

  try {
    homeData.value = await getHomeData()
  }
  catch (error) {
    errorText.value = error instanceof Error ? error.message : '现场开单数据获取失败'
  }
  finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

async function handleSubmit() {
  if (submitting.value) {
    return
  }

  if (!isLoggedIn.value) {
    goLogin()
    return
  }

  if (!pricingRule.value) {
    showToast('门店暂未配置现场计费规则')
    return
  }

  if (rodCount.value <= 0) {
    showToast('请选择杆数')
    return
  }

  const confirmed = await confirmCreateOrder()

  if (!confirmed) {
    return
  }

  submitting.value = true

  try {
    const res = await createWalkInOrder({
      customerPhone: customerPhone.value,
      rodCount: rodCount.value,
      remark: remark.value,
    })
    showToast(res.status === 'pending_payment' ? '请先支付首小时费用' : '开单成功', 'success')

    setTimeout(() => {
      uni.redirectTo({
        url: `/pages/orders/detail?id=${res.orderId}`,
      })
    }, 600)
  }
  catch (error) {
    showToast(error instanceof Error ? error.message : '现场开单失败')
  }
  finally {
    submitting.value = false
  }
}

function goLogin() {
  uni.navigateTo({
    url: `/pages/auth/login?redirect=${encodeURIComponent('/pages/walk-in/index')}`,
  })
}

function formatPrice(price?: number) {
  return `¥${((price || 0) / 100).toFixed(0)}`
}

function getFirstHourAmount() {
  return pricingRule.value?.firstHourAmount || pricingRule.value?.pricePerHour || 0
}

function handleChangeRodCount(delta: number) {
  rodCount.value = Math.min(Math.max(rodCount.value + delta, 1), 20)
}

function confirmCreateOrder() {
  const firstHourAmount = getFirstHourAmount()

  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '确认现场开单',
      content: `本次 ${rodCount.value} 支杆，首小时 ${formatPrice(firstHourAmount)}/支，需预付 ${formatPrice(prepaidAmount.value)}。确认后将创建订单。`,
      confirmText: '确认开单',
      cancelText: '再看看',
      success: (res) => {
        resolve(res.confirm)
      },
      fail: () => {
        resolve(false)
      },
    })
  })
}

function showToast(title: string, icon: UniApp.ShowToastOptions['icon'] = 'none') {
  uni.showToast({
    title,
    icon,
  })
}

onLoad(() => {
  tokenStore.updateNowTime()
  fetchData()
})

onShow(() => {
  tokenStore.updateNowTime()
})

onPullDownRefresh(() => {
  fetchData()
})
</script>

<template>
  <view class="walk-in-page">
    <view class="walk-in-hero">
      <view class="walk-in-hero__tag">
        到店现场开单
      </view>
      <view class="walk-in-hero__title">
        按实际钓虾时长结算
      </view>
      <view class="walk-in-hero__desc">
        开单后向服务员出示开始计时码，服务员确认后开始计时。
      </view>
    </view>

    <view v-if="loading" class="walk-in-placeholder">
      正在加载计费规则...
    </view>

    <view v-else-if="errorText" class="walk-in-placeholder walk-in-placeholder--error">
      <text>{{ errorText }}</text>
      <ActionButton class="walk-in-placeholder__btn" label="重试" @click="fetchData" />
    </view>

    <view v-else class="walk-in-content">
      <view class="walk-in-section">
        <view class="walk-in-section__title">
          计费规则
        </view>
        <PricingRuleCard
          v-if="pricingRule"
          class="walk-in-section__pricing-rule"
          :rule="pricingRule"
          mode="summary"
          show-prepaid
          :prepaid-amount="prepaidAmount"
        />
        <view v-else class="walk-in-placeholder walk-in-placeholder--inner">
          门店暂未配置现场计费规则
        </view>
      </view>

      <view class="walk-in-section">
        <view class="walk-in-section__title">
          开单信息
        </view>
        <view class="form-field">
          <view class="form-field__label">
            杆数
          </view>
          <view class="rod-stepper">
            <ActionButton class="rod-stepper__btn" label="-" variant="ghost" size="small" :disabled="rodCount <= 1" @click="handleChangeRodCount(-1)" />
            <view class="rod-stepper__value">
              {{ rodCount }} 支
            </view>
            <ActionButton class="rod-stepper__btn" label="+" variant="ghost" size="small" :disabled="rodCount >= 20" @click="handleChangeRodCount(1)" />
          </view>
          <view class="form-field__hint">
            后续可在同一订单内支持单支杆独立停杆和续钟。
          </view>
        </view>
        <view class="form-field">
          <view class="form-field__label">
            联系手机号
          </view>
          <input v-model.trim="customerPhone" class="form-field__input" type="tel" :maxlength="30" placeholder="选填，方便门店查找订单">
        </view>
        <view class="form-field">
          <view class="form-field__label">
            备注
          </view>
          <textarea v-model.trim="remark" class="form-field__textarea" :maxlength="80" placeholder="选填，例如人数、特殊需求" />
        </view>
      </view>

      <ActionButton
        class="walk-in-submit"
        block
        variant="secondary"
        size="large"
        :label="submitText"
        :disabled="submitting || (isLoggedIn && !pricingRule)"
        @click="handleSubmit"
      />
    </view>
  </view>
</template>

<style scoped lang="scss">
.walk-in-page {
  min-height: 100vh;
  background: #f4f7f2;
  padding: 24rpx 28rpx 48rpx;
  color: #17211d;
}

.walk-in-hero,
.walk-in-section,
.walk-in-placeholder {
  border-radius: 8rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);
}

.walk-in-hero {
  background: #163b32;
  padding: 34rpx 28rpx;

  &__tag {
    width: fit-content;
    border-radius: 8rpx;
    background: #f6c453;
    padding: 8rpx 14rpx;
    color: #20312b;
    font-size: 23rpx;
    line-height: 1.2;
  }

  &__title {
    margin-top: 26rpx;
    color: #ffffff;
    font-size: 40rpx;
    font-weight: 700;
    line-height: 1.25;
  }

  &__desc {
    margin-top: 14rpx;
    color: #dcebe3;
    font-size: 26rpx;
    line-height: 1.5;
  }
}

.walk-in-content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  margin-top: 22rpx;
}

.walk-in-section {
  padding: 28rpx;

  &__title {
    margin-bottom: 20rpx;
    color: #17211d;
    font-size: 30rpx;
    font-weight: 700;
    line-height: 1.3;
  }
}

.walk-in-placeholder {
  margin-top: 22rpx;
  padding: 44rpx 28rpx;
  color: #718079;
  font-size: 26rpx;
  text-align: center;

  &--inner {
    box-shadow: none;
    background: #f7faf8;
  }

  &--error {
    color: #c9472b;
  }

  &__btn {
    width: 180rpx;
    margin-top: 22rpx;
  }
}

.walk-in-section__pricing-rule {
  margin-top: 0;
}

.form-field {
  margin-top: 20rpx;

  &__label {
    margin-bottom: 10rpx;
    color: #718079;
    font-size: 23rpx;
    line-height: 1.3;
  }

  &__input,
  &__textarea {
    box-sizing: border-box;
    width: 100%;
    border: 2rpx solid #dfe8e3;
    border-radius: 8rpx;
    background: #fbfcfb;
    color: #17211d;
    font-size: 26rpx;
  }

  &__input {
    min-height: 72rpx;
    padding: 0 20rpx;
    line-height: 72rpx;
  }

  &__textarea {
    height: 128rpx;
    padding: 18rpx 20rpx;
    line-height: 1.45;
  }

  &__hint {
    margin-top: 12rpx;
    color: #84918c;
    font-size: 22rpx;
    line-height: 1.4;
  }
}

.rod-stepper {
  display: grid;
  grid-template-columns: 76rpx 1fr 76rpx;
  align-items: center;
  overflow: hidden;
  border: 2rpx solid #dfe8e3;
  border-radius: 8rpx;
  background: #ffffff;

  &__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    width: 76rpx;
    min-height: 76rpx;
    border-radius: 0;
    background: #f4f7f2;
    color: #1f6b56;
    font-size: 34rpx;

    &[disabled] {
      color: #b7c2bd;
    }
  }

  &__value {
    color: #17211d;
    text-align: center;
    font-size: 28rpx;
    font-weight: 700;
    line-height: 1.3;
  }
}

.walk-in-submit {
  margin-top: 28rpx;
  min-height: 78rpx;
}
</style>
