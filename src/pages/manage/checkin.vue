<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { CheckInOrderResult, OrderDateValue } from '@/api/types/order'
import { checkInOrder } from '@/api/order'
import ActionButton from '@/components/ActionButton.vue'
import InfoRow from '@/components/InfoRow.vue'
import PageHero from '@/components/PageHero.vue'
import SectionCard from '@/components/SectionCard.vue'
import { useUserStore } from '@/store'
import { getDateTimeValue } from '@/utils/orderDisplay'
import { hasRole, manageRoles } from '@/utils/roles'

definePage({
  style: {
    navigationBarTitleText: '核销与开始计时',
  },
})

interface ParsedCheckinPayload {
  orderId?: string
  orderNo?: string
  dailyNo?: string
  checkinCode: string
}

const submitting = ref(false)
const manualCode = ref('')
const scanPayload = ref<ParsedCheckinPayload>()
const result = ref<CheckInOrderResult>()
const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)
const canAccessManage = computed(() => hasRole(userInfo.value.role, manageRoles))
const hasCheckedIn = computed(() => !!result.value?.order)
const resultTitle = computed(() => {
  if (!result.value?.order) {
    return '处理成功'
  }

  return result.value.actionText || (result.value.order.orderType === 'metered' ? '现场开单已开始计时' : '套餐已核销并开始计时')
})
const resultDesc = computed(() => {
  if (!result.value?.order) {
    return '系统已识别订单类型并完成处理'
  }

  return result.value.order.orderType === 'metered'
    ? '这是现场开单订单，后续在门店订单处理结束计时和结算。'
    : '这是套餐预约订单，后续在门店订单处理结束计时。'
})
const pageCopy = {
  navigationTitle: '核销与开始计时',
  heroTitle: '核销与开始计时',
  heroDesc: '套餐订单扫码核销后开始计时；现场开单订单确认后开始计时。',
  scanButton: '扫码识别订单',
  manualLabel: '手输核销码或开始计时码',
  pendingTitle: '待处理订单信息',
  codeLabel: '订单号码',
  submitText: '确认处理',
  submittingText: '处理中...',
  modalTitle: '确认处理',
  modalCodeName: '订单号码',
  modalConfirm: '确认处理',
  successTitle: '处理成功',
  errorTitle: '处理失败',
  emptyError: '未识别到订单号码',
  resultNextText: '继续处理下一单',
}

function getOrderTypeText(order: CheckInOrderResult['order']) {
  return order.orderType === 'metered' ? '现场开单' : '套餐预约'
}

function getOrderTypeActionText(order: CheckInOrderResult['order']) {
  return order.orderType === 'metered' ? '已开始计时' : '已核销并开始计时'
}

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
    throw new Error(pageCopy.emptyError)
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
      title: pageCopy.successTitle,
      icon: 'success',
    })
  }
  catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : pageCopy.errorTitle,
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
    title: pageCopy.modalTitle,
    content: payload.dailyNo || payload.orderNo
      ? `订单 ${payload.dailyNo || payload.orderNo} 确认后将开始计时。`
      : `${pageCopy.modalCodeName} ${payload.checkinCode} 确认后将开始计时。`,
    confirmText: pageCopy.modalConfirm,
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

function blockUnauthorizedAccess() {
  uni.showToast({
    title: '无权限访问',
    icon: 'none',
  })

  setTimeout(() => {
    uni.navigateBack()
  }, 800)
}

onLoad(() => {
  if (!canAccessManage.value) {
    blockUnauthorizedAccess()
    return
  }

  uni.setNavigationBarTitle({
    title: pageCopy.navigationTitle,
  })
})
</script>

<template>
  <view class="checkin-page">
    <PageHero
      tag="门店操作"
      :title="hasCheckedIn ? resultTitle : pageCopy.heroTitle"
      :description="hasCheckedIn ? resultDesc : pageCopy.heroDesc"
    />

    <SectionCard v-if="!hasCheckedIn" class="checkin-card">
      <ActionButton class="checkin-page__scan-btn" block size="large" :label="pageCopy.scanButton" :disabled="submitting" @click="handleScan" />

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
        <InfoRow v-if="displayPayload.dailyNo" label="沟通编号" :value="displayPayload.dailyNo" variant="code" />
        <InfoRow v-if="displayPayload.orderNo" label="订单号" :value="displayPayload.orderNo" />
        <InfoRow :label="pageCopy.codeLabel" :value="displayPayload.checkinCode" variant="code" />
      </view>

      <ActionButton
        class="checkin-page__submit-btn"
        block
        size="large"
        variant="secondary"
        :label="pageCopy.submitText"
        :loading="submitting"
        :loading-text="pageCopy.submittingText"
        :disabled="!canSubmit"
        @click="handleSubmit"
      />
    </SectionCard>

    <SectionCard v-if="result?.order" class="result-card" :title="resultTitle" title-variant="success">
      <InfoRow v-if="result.order.dailyNo" label="沟通编号" :value="result.order.dailyNo" variant="code" />
      <InfoRow label="订单号" :value="result.order.orderNo" />
      <InfoRow label="订单类型" :value="getOrderTypeText(result.order)" />
      <InfoRow label="处理结果" :value="getOrderTypeActionText(result.order)" variant="muted" />
      <InfoRow :label="result.order.orderType === 'metered' ? '计费规则' : '套餐'" :value="getOrderName(result.order)" />
      <InfoRow
        :label="result.order.orderType === 'metered' ? '结算方式' : '金额'"
        :value="getAmountText(result.order)"
        :variant="result.order.orderType === 'metered' ? 'muted' : 'price'"
      />
      <InfoRow label="开始时间" :value="formatDateTime(result.order.startedAt || result.checkedInAt)" />
      <InfoRow :label="result.order.orderType === 'metered' ? '计费说明' : '预计结束'" :value="getExpectedEndedAtText(result.order)" />

      <ActionButton class="result-card__next-btn" block size="large" :label="pageCopy.resultNextText" @click="handleNextCheckin" />
    </SectionCard>
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
    font-size: 30rpx;
  }

  &__submit-btn {
    margin-top: 28rpx;
  }
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
  &__next-btn {
    margin-top: 24rpx;
    font-size: 28rpx;
  }
}
</style>
