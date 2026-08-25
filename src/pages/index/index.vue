<script lang="ts" setup>
import type { HomeData, ShrimpPackage, TimeSlot } from '@/api/types/home'
import { defaultHomeData, getHomeData } from '@/api/home'

defineOptions({
  name: 'Home',
})

definePage({
  type: 'home',
  style: {
    navigationStyle: 'custom',
    navigationBarTitleText: '首页',
    enablePullDownRefresh: true,
  },
})

const homeData = ref<HomeData>({ ...defaultHomeData })
const loading = ref(false)
const errorText = ref('')

const shopInfo = computed(() => homeData.value.settings)
const packageList = computed(() => homeData.value.packages)
const timeSlotList = computed(() => homeData.value.timeSlots)
const businessHourText = computed(() => {
  const hours = shopInfo.value.businessHours

  if (!hours.length) {
    return '营业时间待设置'
  }

  return hours.map(item => `${item.label} ${item.startTime}-${item.endTime}`).join(' / ')
})

async function fetchHomeData() {
  loading.value = true
  errorText.value = ''

  try {
    homeData.value = await getHomeData()
  }
  catch (error) {
    errorText.value = error instanceof Error ? error.message : '首页数据获取失败'
  }
  finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

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

function getSlotRemaining(slot: TimeSlot) {
  return Math.max(slot.capacity - slot.bookedCount, 0)
}

function getSlotStatusText(slot: TimeSlot) {
  if (slot.status === 'full' || getSlotRemaining(slot) <= 0) {
    return '已满'
  }

  if (slot.status === 'closed') {
    return '已关闭'
  }

  return `余 ${getSlotRemaining(slot)}`
}

function handleBooking(packageItem?: ShrimpPackage) {
  const query = packageItem?._id ? `?packageId=${packageItem._id}` : ''

  uni.navigateTo({
    url: `/pages/booking/index${query}`,
  })
}

function handleCallShop() {
  if (!shopInfo.value.phone) {
    uni.showToast({
      title: '门店电话待设置',
      icon: 'none',
    })
    return
  }

  uni.makePhoneCall({
    phoneNumber: shopInfo.value.phone,
  })
}

onLoad(() => {
  fetchHomeData()
})

onPullDownRefresh(() => {
  fetchHomeData()
})
</script>

<template>
  <view class="home-page">
    <view class="home-page__hero">
      <view class="home-page__hero-content">
        <view class="home-page__status">
          今日可预约
        </view>
        <view class="home-page__title">
          {{ shopInfo.shopName }}
        </view>
        <view class="home-page__desc">
          {{ businessHourText }}
        </view>
        <view class="home-page__address">
          {{ shopInfo.address }}
        </view>
        <view class="home-page__actions">
          <button
            class="home-page__primary-btn"
            :disabled="loading"
            @click="handleBooking()"
          >
            立即预约
          </button>
          <button
            class="home-page__ghost-btn"
            :disabled="loading"
            @click="handleCallShop"
          >
            联系门店
          </button>
        </view>
      </view>
    </view>

    <view v-if="errorText" class="home-page__alert">
      <text>{{ errorText }}</text>
      <button class="home-page__retry-btn" :disabled="loading" @click="fetchHomeData">
        重试
      </button>
    </view>

    <view class="home-section">
      <view class="home-section__header">
        <view>
          <view class="home-section__title">
            热门套餐
          </view>
          <view class="home-section__subtitle">
            固定时长，适合提前预约
          </view>
        </view>
      </view>

      <view v-if="loading" class="home-page__placeholder">
        正在加载套餐...
      </view>
      <view v-else-if="!packageList.length" class="home-page__placeholder">
        套餐暂未配置
      </view>
      <view v-else class="package-list">
        <view
          v-for="packageItem in packageList"
          :key="packageItem._id"
          class="package-card"
        >
          <view class="package-card__main">
            <view class="package-card__name">
              {{ packageItem.name }}
            </view>
            <view class="package-card__desc">
              {{ packageItem.description || '门店精选套餐' }}
            </view>
            <view class="package-card__meta">
              {{ formatDuration(packageItem.durationMinutes) }} · {{ packageItem.rodCount }} 根杆 · 建议 {{ packageItem.maxPeople }} 人
            </view>
          </view>
          <view class="package-card__side">
            <view class="package-card__price">
              {{ formatPrice(packageItem.price) }}
            </view>
            <button class="package-card__btn" :disabled="loading" @click="handleBooking(packageItem)">
              预约
            </button>
          </view>
        </view>
      </view>
    </view>

    <view class="home-section">
      <view class="home-section__header">
        <view>
          <view class="home-section__title">
            近期场次
          </view>
          <view class="home-section__subtitle">
            选择日期和时间，到店后核销开始
          </view>
        </view>
      </view>

      <view v-if="loading" class="home-page__placeholder">
        正在加载场次...
      </view>
      <view v-else-if="!timeSlotList.length" class="home-page__placeholder">
        近期场次暂未开放
      </view>
      <view v-else class="slot-list">
        <view v-for="slot in timeSlotList" :key="slot._id" class="slot-card">
          <view>
            <view class="slot-card__date">
              {{ slot.date }}
            </view>
            <view class="slot-card__time">
              {{ slot.startTime }}-{{ slot.endTime }}
            </view>
          </view>
          <view
            class="slot-card__status"
            :class="{ 'slot-card__status--full': slot.status === 'full' || getSlotRemaining(slot) <= 0 }"
          >
            {{ getSlotStatusText(slot) }}
          </view>
        </view>
      </view>
    </view>

    <view class="home-section home-section--notice">
      <view class="home-section__title">
        门店公告
      </view>
      <view class="home-section__notice">
        {{ shopInfo.notice || '暂无公告' }}
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.home-page {
  min-height: 100vh;
  background: #f4f7f2;
  padding: 0 28rpx 40rpx;
  color: #17211d;

  &__hero {
    margin: 0 -28rpx;
    padding: calc(var(--status-bar-height) + 40rpx) 28rpx 36rpx;
    background: linear-gradient(135deg, #133b32 0%, #1f6b56 58%, #c9472b 100%);
  }

  &__hero-content {
    min-height: 360rpx;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  &__status {
    width: fit-content;
    border-radius: 8rpx;
    background: rgb(255 255 255 / 18%);
    padding: 8rpx 16rpx;
    color: #fff3d8;
    font-size: 24rpx;
    line-height: 1.2;
  }

  &__title {
    margin-top: 28rpx;
    color: #ffffff;
    font-size: 56rpx;
    font-weight: 700;
    line-height: 1.15;
  }

  &__desc {
    margin-top: 20rpx;
    color: #f5ead8;
    font-size: 28rpx;
    line-height: 1.5;
  }

  &__address {
    margin-top: 12rpx;
    color: rgb(255 255 255 / 78%);
    font-size: 24rpx;
    line-height: 1.4;
  }

  &__actions {
    display: flex;
    gap: 20rpx;
    margin-top: 36rpx;
  }

  &__primary-btn,
  &__ghost-btn,
  &__retry-btn {
    min-height: 76rpx;
    border-radius: 8rpx;
    font-size: 28rpx;
    line-height: 76rpx;
  }

  &__primary-btn {
    flex: 1;
    background: #f6c453;
    color: #20312b;
  }

  &__ghost-btn {
    flex: 1;
    border: 2rpx solid rgb(255 255 255 / 45%);
    background: transparent;
    color: #ffffff;
  }

  &__alert {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20rpx;
    margin-top: 24rpx;
    border-radius: 8rpx;
    background: #fff1ec;
    padding: 20rpx;
    color: #a23a25;
    font-size: 26rpx;
  }

  &__retry-btn {
    width: 140rpx;
    min-height: 60rpx;
    background: #c9472b;
    color: #ffffff;
    font-size: 24rpx;
    line-height: 60rpx;
  }

  &__placeholder {
    border-radius: 8rpx;
    background: #ffffff;
    padding: 40rpx 24rpx;
    color: #718079;
    font-size: 26rpx;
    text-align: center;
  }
}

.home-section {
  margin-top: 32rpx;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20rpx;
  }

  &__title {
    color: #17211d;
    font-size: 34rpx;
    font-weight: 700;
    line-height: 1.25;
  }

  &__subtitle {
    margin-top: 8rpx;
    color: #77847d;
    font-size: 24rpx;
    line-height: 1.4;
  }

  &__notice {
    margin-top: 18rpx;
    border-left: 6rpx solid #f6c453;
    padding-left: 20rpx;
    color: #4d5d56;
    font-size: 26rpx;
    line-height: 1.6;
  }

  &--notice {
    border-radius: 8rpx;
    background: #ffffff;
    padding: 28rpx;
  }
}

.package-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.package-card {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 20rpx;
  min-height: 188rpx;
  border-radius: 8rpx;
  background: #ffffff;
  padding: 24rpx;
  box-shadow: 0 12rpx 26rpx rgb(31 59 50 / 6%);

  &__main {
    min-width: 0;
    flex: 1;
  }

  &__name {
    color: #17211d;
    font-size: 32rpx;
    font-weight: 700;
    line-height: 1.25;
  }

  &__desc {
    margin-top: 12rpx;
    color: #5c6b65;
    font-size: 25rpx;
    line-height: 1.45;
  }

  &__meta {
    margin-top: 16rpx;
    color: #8a6f28;
    font-size: 24rpx;
    line-height: 1.35;
  }

  &__side {
    width: 152rpx;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: space-between;
  }

  &__price {
    color: #c9472b;
    font-size: 38rpx;
    font-weight: 700;
    line-height: 1.2;
  }

  &__btn {
    width: 136rpx;
    min-height: 60rpx;
    border-radius: 8rpx;
    background: #1f6b56;
    color: #ffffff;
    font-size: 24rpx;
    line-height: 60rpx;
  }
}

.slot-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
}

.slot-card {
  min-height: 156rpx;
  border-radius: 8rpx;
  background: #ffffff;
  padding: 22rpx;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);

  &__date {
    color: #17211d;
    font-size: 28rpx;
    font-weight: 700;
    line-height: 1.25;
  }

  &__time {
    margin-top: 12rpx;
    color: #66746e;
    font-size: 24rpx;
    line-height: 1.3;
  }

  &__status {
    width: fit-content;
    margin-top: 18rpx;
    border-radius: 8rpx;
    background: #e8f3ed;
    padding: 8rpx 14rpx;
    color: #1f6b56;
    font-size: 22rpx;
    line-height: 1.2;

    &--full {
      background: #f3ece8;
      color: #9a4b31;
    }
  }
}

button::after {
  border: none;
}

button[disabled] {
  opacity: 0.6;
}
</style>
