<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue'
import PageHero from '@/components/PageHero.vue'
import PackageCard from '@/components/PackageCard.vue'
import type { HomeData, ShrimpPackage, TimeSlot } from '@/api/types/home'
import { defaultHomeData, getHomeData } from '@/api/home'
import { createOrder } from '@/api/order'
import { useTokenStore } from '@/store'

definePage({
  style: {
    navigationBarTitleText: '预约钓虾',
  },
})

const homeData = ref<HomeData>({ ...defaultHomeData })
const loading = ref(false)
const submitting = ref(false)
const selectedPackageId = ref('')
const selectedSlotId = ref('')
const tokenStore = useTokenStore()

const packageList = computed(() => homeData.value.packages)
const bookingMode = computed(() => homeData.value.settings.bookingMode || 'walk_in')
const isSlotBookingMode = computed(() => bookingMode.value === 'slot')
const timeSlotList = computed(() => homeData.value.timeSlots.filter(slot => slot.status === 'available' && getSlotRemaining(slot) > 0))
const selectedPackage = computed(() => packageList.value.find(item => item._id === selectedPackageId.value))
const selectedSlot = computed(() => timeSlotList.value.find(item => item._id === selectedSlotId.value))
const isLoggedIn = computed(() => tokenStore.hasLogin)
const submitText = computed(() => {
  if (!isLoggedIn.value) {
    return '去登录'
  }

  return submitting.value ? '提交中...' : '提交预约'
})

async function fetchBookingData(packageId?: string) {
  loading.value = true

  try {
    const data = await getHomeData()
    homeData.value = data
    selectedPackageId.value = packageId && data.packages.some(item => item._id === packageId)
      ? packageId
      : data.packages[0]?._id || ''
    selectedSlotId.value = data.timeSlots.find(slot => slot.status === 'available' && getSlotRemaining(slot) > 0)?._id || ''
  }
  catch (error) {
    const title = error instanceof Error ? error.message : '预约数据获取失败'
    uni.showToast({
      title,
      icon: 'none',
    })
  }
  finally {
    loading.value = false
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

function handleSelectPackage(packageItem: ShrimpPackage) {
  selectedPackageId.value = packageItem._id
}

async function handleSubmit() {
  if (!isLoggedIn.value) {
    goLogin()
    return
  }

  if (!selectedPackage.value) {
    uni.showToast({
      title: '请选择套餐',
      icon: 'none',
    })
    return
  }

  if (isSlotBookingMode.value && !selectedSlot.value) {
    uni.showToast({
      title: '请选择场次',
      icon: 'none',
    })
    return
  }

  const confirmed = await confirmCreateOrder()

  if (!confirmed) {
    return
  }

  submitting.value = true

  try {
    const res = await createOrder({
      packageId: selectedPackage.value._id,
      slotId: isSlotBookingMode.value ? selectedSlot.value?._id : undefined,
    })

    uni.showToast({
      title: res.status === 'pending_payment' ? '订单待支付' : '预约成功',
      icon: 'success',
    })

    setTimeout(() => {
      uni.redirectTo({
        url: `/pages/orders/detail?id=${res.orderId}`,
      })
    }, 600)
  }
  catch (error) {
    const title = error instanceof Error ? error.message : '预约创建失败'
    uni.showToast({
      title,
      icon: 'none',
    })
  }
  finally {
    submitting.value = false
  }
}

function confirmCreateOrder() {
  const packageItem = selectedPackage.value

  if (!packageItem) {
    return Promise.resolve(false)
  }

  const slotText = isSlotBookingMode.value && selectedSlot.value
    ? `\n预约场次：${selectedSlot.value.date} ${selectedSlot.value.startTime}-${selectedSlot.value.endTime}`
    : ''

  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '确认提交预约',
      content: `套餐：${packageItem.name}\n时长：${formatDuration(packageItem.durationMinutes)}\n杆数：${packageItem.rodCount} 支${slotText}\n需支付：${formatPrice(packageItem.price)}`,
      confirmText: '提交预约',
      cancelText: '再看看',
      confirmColor: '#1f6b56',
      success: (res) => {
        resolve(res.confirm)
      },
      fail: () => {
        resolve(false)
      },
    })
  })
}

function goLogin() {
  const query = selectedPackageId.value ? `?packageId=${selectedPackageId.value}` : ''

  uni.navigateTo({
    url: `/pages/auth/login?redirect=${encodeURIComponent(`/pages/booking/index${query}`)}`,
  })
}

onLoad((query) => {
  tokenStore.updateNowTime()
  fetchBookingData(typeof query?.packageId === 'string' ? query.packageId : '')
})

onShow(() => {
  tokenStore.updateNowTime()
})
</script>

<template>
  <view class="booking-page">
    <PageHero title="预约钓虾" description="选择套餐，到店核销后开始计时" />

    <view class="booking-section">
      <view class="booking-section__title">
        套餐
      </view>
      <view v-if="loading" class="booking-page__placeholder">
        正在加载套餐...
      </view>
      <view v-else-if="!packageList.length" class="booking-page__placeholder">
        套餐暂未配置
      </view>
      <view v-else class="package-list">
        <PackageCard
          v-for="packageItem in packageList"
          :key="packageItem._id"
          :package-item="packageItem"
          mode="select"
          :selected="selectedPackageId === packageItem._id"
          :show-description="false"
          :show-people="false"
          @click="handleSelectPackage(packageItem)"
        />
      </view>
    </view>

    <view v-if="isSlotBookingMode" class="booking-section">
      <view class="booking-section__title">
        场次
      </view>
      <view v-if="loading" class="booking-page__placeholder">
        正在加载场次...
      </view>
      <view v-else-if="!timeSlotList.length" class="booking-page__placeholder">
        暂无可预约场次
      </view>
      <view v-else class="slot-list">
        <view
          v-for="slot in timeSlotList"
          :key="slot._id"
          class="slot-card"
          :class="{ 'slot-card--active': selectedSlotId === slot._id }"
          @click="selectedSlotId = slot._id"
        >
          <view class="slot-card__date">
            {{ slot.date }}
          </view>
          <view class="slot-card__time">
            {{ slot.startTime }}-{{ slot.endTime }}
          </view>
          <view class="slot-card__remain">
            剩余 {{ getSlotRemaining(slot) }} 位
          </view>
        </view>
      </view>
    </view>

    <view v-if="selectedPackage" class="booking-section">
      <view class="booking-section__title">
        套餐包含
      </view>
      <view class="package-summary">
        <view>
          <view class="package-summary__label">
            建议人数
          </view>
          <view class="package-summary__desc">
            到店后按套餐安排
          </view>
        </view>
        <text class="package-summary__value">
          {{ selectedPackage.maxPeople }} 人
        </text>
      </view>
      <view class="package-summary">
        <view>
          <view class="package-summary__label">
            杆数
          </view>
          <view class="package-summary__desc">
            已包含在套餐内
          </view>
        </view>
        <text class="package-summary__value">
          {{ selectedPackage.rodCount }} 支
        </text>
      </view>
      <view class="package-summary">
        <view>
          <view class="package-summary__label">
            时长
          </view>
          <view class="package-summary__desc">
            核销后开始计时
          </view>
        </view>
        <text class="package-summary__value">
          {{ formatDuration(selectedPackage.durationMinutes) }}
        </text>
      </view>
    </view>

    <view class="booking-page__summary">
      <view>
        <view class="booking-page__summary-label">
          预约金额
        </view>
        <view class="booking-page__summary-value">
          {{ selectedPackage ? formatPrice(selectedPackage.price) : '待选择' }}
        </view>
      </view>
      <ActionButton class="booking-page__submit" block :label="submitText" :disabled="loading || submitting" @click="handleSubmit" />
    </view>
  </view>
</template>

<style scoped lang="scss">
.booking-page {
  min-height: 100vh;
  background: #f4f7f2;
  padding: 32rpx 28rpx 180rpx;
  color: #17211d;

  &__placeholder {
    border-radius: 8rpx;
    background: #ffffff;
    padding: 36rpx 24rpx;
    color: #718079;
    font-size: 26rpx;
    text-align: center;
  }

  &__summary {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24rpx;
    border-top: 2rpx solid #e6ece8;
    background: #ffffff;
    padding: 22rpx 28rpx calc(env(safe-area-inset-bottom) + 22rpx);
  }

  &__summary-label {
    color: #718079;
    font-size: 24rpx;
    line-height: 1.3;
  }

  &__summary-value {
    margin-top: 6rpx;
    color: #c9472b;
    font-size: 38rpx;
    font-weight: 700;
    line-height: 1.2;
  }

  &__submit {
    margin-top: 18rpx;
    width: 260rpx;
    font-size: 28rpx;
  }
}

.booking-section {
  margin-top: 28rpx;

  &__title {
    margin-bottom: 18rpx;
    color: #17211d;
    font-size: 32rpx;
    font-weight: 700;
    line-height: 1.25;
  }
}

.package-list,
.slot-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.slot-card,
.package-summary {
  border: 2rpx solid transparent;
  border-radius: 8rpx;
  background: #ffffff;
  padding: 24rpx;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);
}

.slot-card {
  &--active {
    border-color: #1f6b56;
  }

  &__date {
    color: #17211d;
    font-size: 28rpx;
    font-weight: 700;
  }

  &__time {
    margin-top: 10rpx;
    color: #596963;
    font-size: 25rpx;
  }

  &__remain {
    width: fit-content;
    margin-top: 14rpx;
    border-radius: 8rpx;
    background: #e8f3ed;
    padding: 8rpx 14rpx;
    color: #1f6b56;
    font-size: 22rpx;
    line-height: 1.2;
  }
}

.package-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  margin-bottom: 18rpx;

  &:last-child {
    margin-bottom: 0;
  }

  &__label {
    color: #17211d;
    font-size: 28rpx;
    font-weight: 700;
  }

  &__desc {
    margin-top: 8rpx;
    color: #718079;
    font-size: 24rpx;
  }

  &__value {
    flex-shrink: 0;
    color: #17211d;
    font-size: 30rpx;
    font-weight: 700;
    text-align: center;
  }
}
</style>
