<script setup lang="ts">
import type { CheckInOrderResult, OrderDateValue } from '@/api/types/order'
import { checkInOrder } from '@/api/order'
import { getDateTimeValue } from '@/utils/orderDisplay'

definePage({
  style: {
    navigationBarTitleText: '开始计时',
  },
})

interface ParsedCheckinPayload {
  orderId?: string
  orderNo?: string
  dailyNo?: string
  checkinCode: string
}

type CheckinScene = 'package' | 'metered'

const submitting = ref(false)
const manualCode = ref('')
const scanPayload = ref<ParsedCheckinPayload>()
const result = ref<CheckInOrderResult>()
const scene = ref<CheckinScene>('package')
const hasCheckedIn = computed(() => !!result.value?.order)
const isMeteredScene = computed(() => scene.value === 'metered')
const pageCopy = computed(() => {
  if (isMeteredScene.value) {
    return {
      navigationTitle: '开始计时',
      heroTitle: '确认开始计时',
      heroDesc: '扫码或输入顾客出示的开始计时码',
      scanButton: '扫码开始计时',
      manualLabel: '手输开始计时码',
      pendingTitle: '待开始计时信息',
      codeLabel: '开始计时码',
      submitText: '确认开始计时',
      submittingText: '确认中...',
      modalTitle: '确认开始计时',
      modalCodeName: '开始计时码',
      modalConfirm: '开始计时',
      successTitle: '已开始计时',
      errorTitle: '开始计时失败',
      emptyError: '未识别到开始计时信息',
      resultDesc: '订单已开始计时，后续在门店订单处理结束计时',
      resultNextText: '继续处理下一单',
    }
  }

  return {
    navigationTitle: '套餐核销',
    heroTitle: '套餐核销',
    heroDesc: '扫码或输入顾客出示的套餐核销码',
    scanButton: '扫码核销',
    manualLabel: '手输套餐核销码',
    pendingTitle: '待核销信息',
    codeLabel: '套餐核销码',
    submitText: '确认核销',
    submittingText: '核销中...',
    modalTitle: '确认核销',
    modalCodeName: '核销码',
    modalConfirm: '确认核销',
    successTitle: '核销成功',
    errorTitle: '订单核销失败',
    emptyError: '未识别到核销信息',
    resultDesc: '套餐已核销，订单已开始计时，后续在门店订单处理结束计时',
    resultNextText: '继续核销下一单',
  }
})

const displayPayload = computed<ParsedCheckinPayload | undefined>(() => {
  const safeManualCode = manualCode.value.trim()

  if (scanPayload.value) {
    return scanPayload.value
  }

  if (safeManualCode) {
    return {
      checkinCode: safeManualCode,
    }
  }

  return undefined
})
const canSubmit = computed(() => !!displayPayload.value?.checkinCode && !submitting.value)

function normalizeCode(value: string) {
  return value.trim().replace(/\s/g, '')
}

function parseQueryText(text: string) {
  const queryText = text.includes('?') ? text.split('?')[1] : text
  const pairs = queryText.split('&')
  const payload: Record<string, string> = {}

  pairs.forEach((pair) => {
    const [key, value = ''] = pair.split('=')

    if (key) {
      payload[decodeURIComponent(key)] = decodeURIComponent(value)
    }
  })

  return payload
}

function parseCheckinPayload(text: string): ParsedCheckinPayload {
  const rawText = text.trim()

  if (!rawText) {
    throw new Error(pageCopy.value.emptyError)
  }

  try {
    const parsed = JSON.parse(rawText) as Partial<ParsedCheckinPayload> & { type?: string }

    if (parsed.type === 'shrimp_fishing_checkin' && parsed.checkinCode) {
      return {
        orderId: parsed.orderId?.trim(),
        orderNo: parsed.orderNo?.trim(),
        dailyNo: parsed.dailyNo?.trim(),
        checkinCode: normalizeCode(parsed.checkinCode),
      }
    }
  }
  catch {
    // 继续按 URL query 或纯数字码解析。
  }

  if (rawText.includes('checkinCode=')) {
    const query = parseQueryText(rawText)
    const checkinCode = normalizeCode(query.checkinCode || '')

    if (checkinCode) {
      return {
        orderId: query.orderId?.trim(),
        orderNo: query.orderNo?.trim(),
        dailyNo: query.dailyNo?.trim(),
        checkinCode,
      }
    }
  }

  return {
    checkinCode: normalizeCode(rawText),
  }
}

function handleManualInput(event: { detail: { value: string } }) {
  manualCode.value = event.detail.value
  scanPayload.value = undefined
  result.value = undefined
}

function handleScan() {
  if (submitting.value) {
    return
  }

  uni.scanCode({
    onlyFromCamera: true,
    success: (res) => {
      try {
        scanPayload.value = parseCheckinPayload(res.result || '')
        manualCode.value = scanPayload.value.checkinCode
        result.value = undefined
      }
      catch (error) {
        uni.showToast({
          title: error instanceof Error ? error.message : '二维码无法识别',
          icon: 'none',
        })
      }
    },
    fail: () => {
      uni.showToast({
        title: '未完成扫码',
        icon: 'none',
      })
    },
  })
}

async function submitCheckin(payload: ParsedCheckinPayload) {
  submitting.value = true

  try {
    result.value = await checkInOrder({
      orderId: payload.orderId,
      checkinCode: payload.checkinCode,
    })
    uni.showToast({
      title: pageCopy.value.successTitle,
      icon: 'success',
    })
  }
  catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : pageCopy.value.errorTitle,
      icon: 'none',
    })
  }
  finally {
    submitting.value = false
  }
}

function handleSubmit() {
  const payload = displayPayload.value

  if (!payload?.checkinCode || submitting.value) {
    return
  }

  uni.showModal({
    title: pageCopy.value.modalTitle,
    content: payload.dailyNo || payload.orderNo
      ? `订单 ${payload.dailyNo || payload.orderNo} 确认后将开始计时。`
      : `${pageCopy.value.modalCodeName} ${payload.checkinCode} 确认后将开始计时。`,
    confirmText: pageCopy.value.modalConfirm,
    confirmColor: '#1f6b56',
    success: (res) => {
      if (res.confirm) {
        submitCheckin(payload)
      }
    },
  })
}

function formatPrice(value?: number) {
  return `¥${((value || 0) / 100).toFixed(0)}`
}

function getOrderName(order: CheckInOrderResult['order']) {
  if (order.orderType === 'metered') {
    return order.pricingRuleSnapshot?.name || '现场计时'
  }

  return order.packageSnapshot?.name || '套餐订单'
}

function getAmountText(order: CheckInOrderResult['order']) {
  if (order.orderType === 'metered') {
    return '结束后结算'
  }

  return formatPrice(order.finalAmount)
}

function getExpectedEndedAtText(order: CheckInOrderResult['order']) {
  if (order.orderType === 'metered') {
    return '按实际结束时间计算'
  }

  return formatDateTime(order.expectedEndedAt)
}

function formatDateTime(value?: OrderDateValue) {
  if (!value) {
    return '-'
  }

  const time = getDateTimeValue(value)

  if (!time) {
    return '-'
  }

  const date = new Date(time)
  const pad = (num: number) => `${num}`.padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function handleNextCheckin() {
  manualCode.value = ''
  scanPayload.value = undefined
  result.value = undefined
}

onLoad((query) => {
  scene.value = query?.scene === 'metered' ? 'metered' : 'package'

  uni.setNavigationBarTitle({
    title: pageCopy.value.navigationTitle,
  })
})
</script>

<template>
  <view class="checkin-page">
    <view class="checkin-hero">
      <view class="checkin-hero__label">
        门店工作台
      </view>
      <view class="checkin-hero__title">
        {{ hasCheckedIn ? '已开始计时' : pageCopy.heroTitle }}
      </view>
      <view class="checkin-hero__desc">
        {{ hasCheckedIn ? pageCopy.resultDesc : pageCopy.heroDesc }}
      </view>
    </view>

    <view v-if="!hasCheckedIn" class="checkin-card">
      <button class="checkin-page__scan-btn" :disabled="submitting" @click="handleScan">
        {{ pageCopy.scanButton }}
      </button>

      <view class="manual-field">
        <view class="manual-field__label">
          {{ pageCopy.manualLabel }}
        </view>
        <input
          class="manual-field__input"
          :value="manualCode"
          :maxlength="20"
          placeholder="输入顾客出示的号码"
          type="text"
          @input="handleManualInput"
        >
      </view>

      <view v-if="displayPayload" class="pending-order">
        <view class="pending-order__title">
          {{ pageCopy.pendingTitle }}
        </view>
        <view v-if="displayPayload.dailyNo" class="info-row">
          <text class="info-row__label">
            沟通编号
          </text>
          <text class="info-row__value info-row__value--code">
            {{ displayPayload.dailyNo }}
          </text>
        </view>
        <view v-if="displayPayload.orderNo" class="info-row">
          <text class="info-row__label">
            订单号
          </text>
          <text class="info-row__value">
            {{ displayPayload.orderNo }}
          </text>
        </view>
        <view class="info-row">
          <text class="info-row__label">
            {{ pageCopy.codeLabel }}
          </text>
          <text class="info-row__value info-row__value--code">
            {{ displayPayload.checkinCode }}
          </text>
        </view>
      </view>

      <button class="checkin-page__submit-btn" :disabled="!canSubmit" @click="handleSubmit">
        {{ submitting ? pageCopy.submittingText : pageCopy.submitText }}
      </button>
    </view>

    <view v-if="result?.order" class="result-card">
      <view class="result-card__title">
        已开始计时
      </view>
      <view v-if="result.order.dailyNo" class="info-row">
        <text class="info-row__label">
          沟通编号
        </text>
        <text class="info-row__value info-row__value--code">
          {{ result.order.dailyNo }}
        </text>
      </view>
      <view class="info-row">
        <text class="info-row__label">
          订单号
        </text>
        <text class="info-row__value">
          {{ result.order.orderNo }}
        </text>
      </view>
      <view class="info-row">
        <text class="info-row__label">
          {{ result.order.orderType === 'metered' ? '计费规则' : '套餐' }}
        </text>
        <text class="info-row__value">
          {{ getOrderName(result.order) }}
        </text>
      </view>
      <view class="info-row">
        <text class="info-row__label">
          {{ result.order.orderType === 'metered' ? '结算方式' : '金额' }}
        </text>
        <text class="info-row__price" :class="{ 'info-row__price--muted': result.order.orderType === 'metered' }">
          {{ getAmountText(result.order) }}
        </text>
      </view>
      <view class="info-row">
        <text class="info-row__label">
          开始时间
        </text>
        <text class="info-row__value">
          {{ formatDateTime(result.order.startedAt || result.checkedInAt) }}
        </text>
      </view>
      <view class="info-row">
        <text class="info-row__label">
          {{ result.order.orderType === 'metered' ? '计费说明' : '预计结束' }}
        </text>
        <text class="info-row__value">
          {{ getExpectedEndedAtText(result.order) }}
        </text>
      </view>

      <button class="result-card__next-btn" @click="handleNextCheckin">
        {{ pageCopy.resultNextText }}
      </button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.checkin-page {
  min-height: 100vh;
  background: #f4f7f2;
  padding: 28rpx;
  color: #17211d;

  &__scan-btn,
  &__submit-btn {
    min-height: 84rpx;
    border-radius: 8rpx;
    font-size: 30rpx;
    font-weight: 600;
    line-height: 84rpx;
  }

  &__scan-btn {
    background: #1f6b56;
    color: #ffffff;
  }

  &__submit-btn {
    margin-top: 28rpx;
    background: #f6c453;
    color: #20312b;
  }
}

.checkin-hero {
  border-radius: 8rpx;
  background: #163b32;
  padding: 36rpx 28rpx;

  &__label {
    width: fit-content;
    border-radius: 8rpx;
    background: #f6c453;
    padding: 8rpx 14rpx;
    color: #20312b;
    font-size: 22rpx;
    line-height: 1.2;
  }

  &__title {
    margin-top: 28rpx;
    color: #ffffff;
    font-size: 44rpx;
    font-weight: 700;
    line-height: 1.2;
  }

  &__desc {
    margin-top: 12rpx;
    color: #f5ead8;
    font-size: 26rpx;
    line-height: 1.4;
  }
}

.checkin-card,
.result-card {
  margin-top: 24rpx;
  border-radius: 8rpx;
  background: #ffffff;
  padding: 28rpx;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);
}

.manual-field {
  margin-top: 28rpx;

  &__label {
    color: #17211d;
    font-size: 28rpx;
    font-weight: 600;
    line-height: 1.3;
  }

  &__input {
    box-sizing: border-box;
    width: 100%;
    height: 88rpx;
    margin-top: 16rpx;
    border: 2rpx solid #dfe8e3;
    border-radius: 8rpx;
    background: #fbfdfb;
    padding: 0 22rpx;
    color: #17211d;
    font-size: 30rpx;
  }
}

.pending-order {
  margin-top: 24rpx;
  border-radius: 8rpx;
  background: #f8f2df;
  padding: 22rpx;

  &__title {
    margin-bottom: 10rpx;
    color: #20312b;
    font-size: 28rpx;
    font-weight: 700;
    line-height: 1.3;
  }
}

.result-card {
  &__title {
    margin-bottom: 14rpx;
    color: #1f6b56;
    font-size: 34rpx;
    font-weight: 700;
    line-height: 1.25;
  }

  &__next-btn {
    min-height: 78rpx;
    margin-top: 24rpx;
    border-radius: 8rpx;
    background: #1f6b56;
    color: #ffffff;
    font-size: 28rpx;
    font-weight: 600;
    line-height: 78rpx;
  }
}

.info-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  padding: 16rpx 0;
  border-bottom: 2rpx solid #eef2ef;

  &:last-child {
    border-bottom: none;
  }

  &__label {
    flex-shrink: 0;
    color: #718079;
    font-size: 26rpx;
    line-height: 1.4;
  }

  &__value,
  &__price {
    min-width: 0;
    color: #17211d;
    font-size: 26rpx;
    line-height: 1.4;
    text-align: right;
    word-break: break-all;
  }

  &__value--code {
    font-size: 36rpx;
    font-weight: 700;
    letter-spacing: 4rpx;
  }

  &__price {
    color: #c9472b;
    font-size: 30rpx;
    font-weight: 700;

    &--muted {
      color: #52615b;
      font-size: 26rpx;
    }
  }
}

button::after {
  border: none;
}

button[disabled] {
  opacity: 0.55;
}
</style>
