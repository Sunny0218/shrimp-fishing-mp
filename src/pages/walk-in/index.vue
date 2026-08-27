<script setup lang="ts">
import type { HomeData } from '@/api/types/home'
import { defaultHomeData, getHomeData } from '@/api/home'
import { createWalkInOrder } from '@/api/order'

definePage({
  style: {
    navigationBarTitleText: '现场开单',
    enablePullDownRefresh: true,
  },
})

const homeData = ref<HomeData>({ ...defaultHomeData })
const customerPhone = ref('')
const remark = ref('')
const loading = ref(false)
const submitting = ref(false)
const errorText = ref('')
const pricingRule = computed(() => homeData.value.pricingRule)

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

  if (!pricingRule.value) {
    showToast('门店暂未配置现场计费规则')
    return
  }

  submitting.value = true

  try {
    const res = await createWalkInOrder({
      customerPhone: customerPhone.value,
      remark: remark.value,
    })
    showToast('开单成功', 'success')

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

function formatPrice(price?: number) {
  return `¥${((price || 0) / 100).toFixed(0)}`
}

function formatDuration(minutes?: number) {
  const duration = minutes || 0

  if (duration < 60) {
    return `${duration}分钟`
  }

  const hours = Math.floor(duration / 60)
  const restMinutes = duration % 60

  return restMinutes ? `${hours}小时${restMinutes}分钟` : `${hours}小时`
}

function getFirstHourAmount() {
  return pricingRule.value?.firstHourAmount || pricingRule.value?.pricePerHour || 0
}

function getExtraPricePerHour() {
  return pricingRule.value?.extraPricePerHour || pricingRule.value?.pricePerHour || 0
}

function showToast(title: string, icon: UniApp.ShowToastOptions['icon'] = 'none') {
  uni.showToast({
    title,
    icon,
  })
}

onLoad(() => {
  fetchData()
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
      <button class="walk-in-placeholder__btn" @click="fetchData">
        重试
      </button>
    </view>

    <view v-else class="walk-in-content">
      <view class="walk-in-section">
        <view class="walk-in-section__title">
          计费规则
        </view>
        <view v-if="pricingRule" class="pricing-card">
          <view>
            <view class="pricing-card__name">
              {{ pricingRule.name }}
            </view>
            <view class="pricing-card__desc">
              {{ pricingRule.description || '从服务员确认开始计时时计算' }}
            </view>
          </view>
          <view class="pricing-card__price">
            首小时 {{ formatPrice(getFirstHourAmount()) }}
          </view>
          <view class="pricing-card__extra">
            续钟 {{ formatPrice(getExtraPricePerHour()) }}/小时
          </view>
          <view class="pricing-card__meta">
            最低 {{ formatDuration(pricingRule.minimumMinutes) }} · 按 {{ formatDuration(pricingRule.unitMinutes) }} 计费
          </view>
        </view>
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

      <button
        class="walk-in-submit"
        :disabled="submitting || !pricingRule"
        @click="handleSubmit"
      >
        {{ submitting ? '开单中...' : '确认开单' }}
      </button>
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
    min-height: 66rpx;
    margin-top: 22rpx;
    border-radius: 8rpx;
    background: #1f6b56;
    color: #ffffff;
    font-size: 25rpx;
    line-height: 66rpx;
  }
}

.pricing-card {
  margin-top: 20rpx;
  border: 2rpx solid #e5eee9;
  border-radius: 8rpx;
  background: #fbfcfb;
  padding: 22rpx;

  &__name {
    color: #17211d;
    font-size: 30rpx;
    font-weight: 700;
    line-height: 1.3;
  }

  &__desc {
    margin-top: 12rpx;
    color: #718079;
    font-size: 24rpx;
    line-height: 1.4;
  }

  &__price {
    margin-top: 22rpx;
    color: #c9472b;
    font-size: 38rpx;
    font-weight: 700;
    line-height: 1.2;
  }

  &__extra {
    margin-top: 10rpx;
    color: #8a6a19;
    font-size: 25rpx;
    font-weight: 600;
    line-height: 1.35;
  }

  &__meta {
    margin-top: 12rpx;
    color: #8a6a19;
    font-size: 24rpx;
    line-height: 1.4;
  }
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
}

.walk-in-submit {
  min-height: 78rpx;
  border-radius: 8rpx;
  background: #f6c453;
  color: #20312b;
  font-size: 28rpx;
  font-weight: 700;
  line-height: 78rpx;
}

button::after {
  border: none;
}

button[disabled] {
  opacity: 0.55;
}
</style>
