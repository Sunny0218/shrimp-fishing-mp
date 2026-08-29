<script setup lang="ts">
import type { PricingRule } from '@/api/types/home'
import type { PricingRuleStatus } from '@/api/types/pricing'
import { getManagePricingRules, savePricingRule, updatePricingRuleStatus } from '@/api/pricing'
import { useLatestRequest } from '@/hooks/useLatestRequest'
import { useNativeLoading } from '@/hooks/useNativeLoading'
import { markHomeDataDirty } from '@/utils/homeDataRefresh'

definePage({
  style: {
    navigationBarTitleText: '计费规则',
    enablePullDownRefresh: true,
  },
})

interface PricingForm {
  pricingRuleId: string
  name: string
  description: string
  firstHourAmountYuan: string
  extraPricePerHourYuan: string
  minimumMinutes: string
  unitMinutes: string
  sort: string
  status: PricingRuleStatus
}

const defaultForm: PricingForm = {
  pricingRuleId: '',
  name: '',
  description: '',
  firstHourAmountYuan: '',
  extraPricePerHourYuan: '',
  minimumMinutes: '60',
  unitMinutes: '30',
  sort: '0',
  status: 'active',
}
const statusOptions: Array<{ label: string, value: PricingRuleStatus }> = [
  { label: '启用', value: 'active' },
  { label: '停用', value: 'disabled' },
]

const errorText = ref('')
const canEdit = ref(false)
const ruleList = ref<PricingRule[]>([])
const hasFetched = ref(false)
const showForm = ref(false)
const saving = ref(false)
const updatingStatusId = ref('')
const form = reactive<PricingForm>({ ...defaultForm })
const { loading: requestLoading, runLatest } = useLatestRequest()
const showInitialLoading = computed(() => requestLoading.value && !hasFetched.value)
const showLoadingOverlay = computed(() => requestLoading.value && hasFetched.value)
const statusIndex = computed(() => Math.max(statusOptions.findIndex(item => item.value === form.status), 0))
const formTitle = computed(() => form.pricingRuleId ? '编辑计费规则' : '新增计费规则')
useNativeLoading(showLoadingOverlay, '加载中')

async function fetchRules() {
  errorText.value = ''

  await runLatest(
    () => getManagePricingRules(),
    {
      onSuccess: (res) => {
        ruleList.value = res.rows || []
        canEdit.value = !!res.canEdit
        hasFetched.value = true
      },
      onError: (error) => {
        errorText.value = error instanceof Error ? error.message : '计费规则获取失败'
        hasFetched.value = true
      },
      onFinally: () => {
        uni.stopPullDownRefresh()
      },
    },
  )
}

function resetForm() {
  Object.assign(form, defaultForm)
}

function handleCreate() {
  if (!canEdit.value) {
    showNoEditToast()
    return
  }

  resetForm()
  showForm.value = true
  scrollToForm()
}

function handleEdit(rule: PricingRule) {
  if (!canEdit.value) {
    showNoEditToast()
    return
  }

  Object.assign(form, {
    pricingRuleId: rule._id,
    name: rule.name || '',
    description: rule.description || '',
    firstHourAmountYuan: formatPriceInput(rule.firstHourAmount || rule.pricePerHour),
    extraPricePerHourYuan: formatPriceInput(rule.extraPricePerHour || rule.pricePerHour),
    minimumMinutes: `${rule.minimumMinutes || 60}`,
    unitMinutes: `${rule.unitMinutes || 30}`,
    sort: `${rule.sort || 0}`,
    status: rule.status || 'active',
  })
  showForm.value = true
  scrollToForm()
}

function handleCancelForm() {
  showForm.value = false
  resetForm()
}

function handleStatusChange(event: { detail: { value: number | string } }) {
  const index = Number(event.detail.value)
  const option = statusOptions[index]

  if (option) {
    form.status = option.value
  }
}

async function handleSave() {
  if (!canEdit.value || saving.value) {
    return
  }

  const name = form.name.trim()
  const description = form.description.trim()
  const firstHourAmount = toPriceCent(form.firstHourAmountYuan)
  const extraPricePerHour = toPriceCent(form.extraPricePerHourYuan)
  const minimumMinutes = toPositiveInteger(form.minimumMinutes)
  const unitMinutes = toPositiveInteger(form.unitMinutes)
  const sort = toInteger(form.sort)

  if (!name) {
    showToast('请填写规则名称')
    return
  }

  if (firstHourAmount <= 0) {
    showToast('请填写有效首小时价格')
    return
  }

  if (extraPricePerHour <= 0) {
    showToast('请填写有效续钟每小时价')
    return
  }

  if (minimumMinutes <= 0) {
    showToast('请填写有效最低计费分钟')
    return
  }

  if (unitMinutes <= 0) {
    showToast('请填写有效计费粒度')
    return
  }

  saving.value = true

  try {
    await savePricingRule({
      ...(form.pricingRuleId ? { pricingRuleId: form.pricingRuleId } : {}),
      name,
      description,
      pricePerHour: firstHourAmount,
      firstHourAmount,
      extraPricePerHour,
      minimumMinutes,
      unitMinutes,
      sort,
      status: form.status,
    })
    markHomeDataDirty()
    showToast('保存成功', 'success')
    showForm.value = false
    resetForm()
    await fetchRules()
  }
  catch (error) {
    showToast(error instanceof Error ? error.message : '计费规则保存失败')
  }
  finally {
    saving.value = false
  }
}

async function handleToggleStatus(rule: PricingRule) {
  if (!canEdit.value || updatingStatusId.value) {
    return
  }

  const nextStatus: PricingRuleStatus = rule.status === 'active' ? 'disabled' : 'active'
  updatingStatusId.value = rule._id

  try {
    await updatePricingRuleStatus({
      pricingRuleId: rule._id,
      status: nextStatus,
    })
    markHomeDataDirty()
    showToast(nextStatus === 'active' ? '已启用' : '已停用', 'success')
    await fetchRules()
  }
  catch (error) {
    showToast(error instanceof Error ? error.message : '计费规则状态调整失败')
  }
  finally {
    updatingStatusId.value = ''
  }
}

function scrollToForm() {
  setTimeout(() => {
    uni.pageScrollTo({
      scrollTop: 0,
      duration: 260,
    })
  }, 50)
}

function toInteger(value: string) {
  const number = Number(value)

  return Number.isFinite(number) ? Math.floor(number) : 0
}

function toPositiveInteger(value: string) {
  return Math.max(toInteger(value), 0)
}

function toPriceCent(value: string) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return 0
  }

  return Math.max(Math.round(number * 100), 0)
}

function formatPriceInput(price?: number) {
  if (!price) {
    return ''
  }

  return `${(price / 100).toFixed(price % 100 === 0 ? 0 : 2)}`
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

function showNoEditToast() {
  showToast('服务员仅可查看计费规则')
}

function showToast(title: string, icon: UniApp.ShowToastOptions['icon'] = 'none') {
  uni.showToast({
    title,
    icon,
  })
}

onLoad(() => {
  fetchRules()
})

onPullDownRefresh(() => {
  fetchRules()
})
</script>

<template>
  <view class="pricing-page">
    <view class="pricing-toolbar">
      <view>
        <view class="pricing-toolbar__title">
          计费规则
        </view>
        <view class="pricing-toolbar__desc">
          {{ canEdit ? '配置顾客现场开单后的按时计费标准' : '当前角色仅可查看计费规则' }}
        </view>
      </view>
      <button
        v-if="canEdit"
        class="pricing-toolbar__btn"
        :disabled="saving"
        @click="handleCreate"
      >
        新增
      </button>
    </view>

    <view class="pricing-note">
      只有一条启用中的计费规则会用于顾客现场开单；启用新规则时，其他规则会自动停用。
    </view>

    <view v-if="showForm" class="pricing-form">
      <view class="pricing-form__header">
        <view class="pricing-form__title">
          {{ formTitle }}
        </view>
        <button class="pricing-form__close" :disabled="saving" @click="handleCancelForm">
          取消
        </button>
      </view>

      <view class="form-field">
        <view class="form-field__label">
          规则名称
        </view>
        <input v-model.trim="form.name" class="form-field__input" :maxlength="30" placeholder="例如 现场计时标准价">
      </view>

      <view class="form-field">
        <view class="form-field__label">
          规则描述
        </view>
        <textarea v-model.trim="form.description" class="form-field__textarea" :maxlength="80" placeholder="给顾客看的计费说明" />
      </view>

      <view class="form-grid">
        <view class="form-field">
          <view class="form-field__label">
            首小时价格（元）
          </view>
          <input v-model.trim="form.firstHourAmountYuan" class="form-field__input" type="digit" placeholder="68">
        </view>
        <view class="form-field">
          <view class="form-field__label">
            续钟每小时价（元）
          </view>
          <input v-model.trim="form.extraPricePerHourYuan" class="form-field__input" type="digit" placeholder="58">
        </view>
        <view class="form-field">
          <view class="form-field__label">
            最低计费（分钟）
          </view>
          <input v-model.trim="form.minimumMinutes" class="form-field__input" type="number" placeholder="60">
        </view>
        <view class="form-field">
          <view class="form-field__label">
            计费粒度（分钟）
          </view>
          <input v-model.trim="form.unitMinutes" class="form-field__input" type="number" placeholder="30">
        </view>
        <view class="form-field">
          <view class="form-field__label">
            排序
          </view>
          <input v-model.trim="form.sort" class="form-field__input" type="number" placeholder="0">
        </view>
        <view class="form-field">
          <view class="form-field__label">
            状态
          </view>
          <picker :value="statusIndex" :range="statusOptions" range-key="label" @change="handleStatusChange">
            <view class="form-field__picker">
              {{ statusOptions[statusIndex]?.label || '启用' }}
            </view>
          </picker>
        </view>
      </view>

      <button class="pricing-form__submit" :disabled="saving" @click="handleSave">
        {{ saving ? '保存中...' : '保存计费规则' }}
      </button>
    </view>

    <view class="pricing-content">
      <view v-if="showInitialLoading" class="pricing-placeholder">
        正在加载计费规则...
      </view>
      <view v-else-if="errorText" class="pricing-placeholder pricing-placeholder--error">
        <text>{{ errorText }}</text>
        <button class="pricing-placeholder__btn" @click="fetchRules">
          重试
        </button>
      </view>
      <view v-else-if="!ruleList.length" class="pricing-placeholder">
        暂无计费规则
      </view>
      <view v-else class="pricing-list">
        <view v-for="rule in ruleList" :key="rule._id" class="pricing-card">
          <view class="pricing-card__header">
            <view class="pricing-card__name">
              {{ rule.name }}
            </view>
            <view class="pricing-card__status" :class="{ 'pricing-card__status--disabled': rule.status !== 'active' }">
              {{ rule.status === 'active' ? '启用中' : '停用' }}
            </view>
          </view>
          <view class="pricing-card__desc">
            {{ rule.description || '暂无描述' }}
          </view>
          <view class="pricing-card__price">
            首小时 {{ formatPrice(rule.firstHourAmount || rule.pricePerHour) }}
            <text class="pricing-card__price-sub">
              续钟 {{ formatPrice(rule.extraPricePerHour || rule.pricePerHour) }}/小时
            </text>
          </view>
          <view class="pricing-card__meta">
            <text>最低 {{ formatDuration(rule.minimumMinutes) }}</text>
            <text>按 {{ formatDuration(rule.unitMinutes) }} 计费</text>
            <text>排序 {{ rule.sort || 0 }}</text>
          </view>
          <view v-if="canEdit" class="pricing-card__footer">
            <button class="pricing-card__btn pricing-card__btn--ghost" @click="handleEdit(rule)">
              编辑
            </button>
            <button
              class="pricing-card__btn"
              :class="{ 'pricing-card__btn--warning': rule.status === 'active' }"
              :disabled="updatingStatusId === rule._id"
              @click="handleToggleStatus(rule)"
            >
              {{ updatingStatusId === rule._id ? '处理中' : rule.status === 'active' ? '停用' : '启用' }}
            </button>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.pricing-page {
  min-height: 100vh;
  background: #f4f7f2;
  padding: 24rpx 28rpx 48rpx;
  color: #17211d;
}

.pricing-toolbar,
.pricing-form,
.pricing-card,
.pricing-placeholder,
.pricing-note {
  border-radius: 8rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);
}

.pricing-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 28rpx;

  &__title {
    color: #17352f;
    font-size: 34rpx;
    font-weight: 700;
    line-height: 1.25;
  }

  &__desc {
    margin-top: 10rpx;
    color: #718079;
    font-size: 24rpx;
    line-height: 1.4;
  }

  &__btn {
    flex-shrink: 0;
    width: 132rpx;
    min-height: 64rpx;
    margin: 0;
    border-radius: 8rpx;
    background: #1f6b56;
    color: #ffffff;
    font-size: 25rpx;
    line-height: 64rpx;
  }
}

.pricing-note {
  margin-top: 22rpx;
  padding: 22rpx 24rpx;
  color: #8a6a19;
  font-size: 24rpx;
  line-height: 1.5;
}

.pricing-form {
  margin-top: 22rpx;
  padding: 28rpx;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20rpx;
    margin-bottom: 22rpx;
  }

  &__title {
    color: #17211d;
    font-size: 31rpx;
    font-weight: 700;
    line-height: 1.3;
  }

  &__close {
    width: 112rpx;
    min-height: 56rpx;
    margin: 0;
    border-radius: 8rpx;
    background: #eef2ef;
    color: #52615b;
    font-size: 24rpx;
    line-height: 56rpx;
  }

  &__submit {
    min-height: 76rpx;
    margin-top: 28rpx;
    border-radius: 8rpx;
    background: #f6c453;
    color: #20312b;
    font-size: 28rpx;
    font-weight: 700;
    line-height: 76rpx;
  }
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20rpx;
}

.form-field {
  margin-top: 20rpx;

  .form-grid & {
    margin-top: 0;
  }

  &__label {
    margin-bottom: 10rpx;
    color: #718079;
    font-size: 23rpx;
    line-height: 1.3;
  }

  &__input,
  &__textarea,
  &__picker {
    box-sizing: border-box;
    width: 100%;
    border: 2rpx solid #dfe8e3;
    border-radius: 8rpx;
    background: #fbfcfb;
    color: #17211d;
    font-size: 26rpx;
  }

  &__input,
  &__picker {
    min-height: 72rpx;
    padding: 0 20rpx;
    line-height: 72rpx;
  }

  &__textarea {
    height: 132rpx;
    padding: 18rpx 20rpx;
    line-height: 1.45;
  }
}

.pricing-content {
  margin-top: 22rpx;
}

.pricing-placeholder {
  padding: 44rpx 28rpx;
  color: #718079;
  font-size: 26rpx;
  text-align: center;

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

.pricing-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.pricing-card {
  padding: 26rpx;

  &__header,
  &__footer,
  &__meta {
    display: flex;
    align-items: center;
  }

  &__header {
    justify-content: space-between;
    gap: 20rpx;
  }

  &__name {
    min-width: 0;
    color: #17211d;
    font-size: 31rpx;
    font-weight: 700;
    line-height: 1.3;
  }

  &__status {
    flex-shrink: 0;
    border-radius: 8rpx;
    background: #e8f3ed;
    padding: 8rpx 14rpx;
    color: #1f6b56;
    font-size: 22rpx;
    line-height: 1.2;

    &--disabled {
      background: #f0f2ef;
      color: #89938f;
    }
  }

  &__desc {
    margin-top: 14rpx;
    color: #718079;
    font-size: 25rpx;
    line-height: 1.45;
  }

  &__price {
    margin-top: 18rpx;
    color: #c9472b;
    font-size: 34rpx;
    font-weight: 700;
    line-height: 1.2;

    &-sub {
      display: block;
      margin-top: 8rpx;
      color: #8a6a19;
      font-size: 24rpx;
      font-weight: 600;
    }
  }

  &__meta {
    flex-wrap: wrap;
    gap: 10rpx;
    margin-top: 18rpx;
    color: #52615b;
    font-size: 23rpx;
    line-height: 1.35;

    text {
      border-radius: 8rpx;
      background: #eef4f0;
      padding: 8rpx 12rpx;
    }
  }

  &__footer {
    justify-content: flex-end;
    gap: 12rpx;
    margin-top: 22rpx;
    border-top: 2rpx solid #eef2ef;
    padding-top: 18rpx;
  }

  &__btn {
    width: auto;
    min-width: 108rpx;
    min-height: 58rpx;
    margin: 0;
    border-radius: 8rpx;
    background: #1f6b56;
    padding: 0 22rpx;
    color: #ffffff;
    font-size: 24rpx;
    line-height: 58rpx;
    white-space: nowrap;

    &--ghost {
      background: #eef4f0;
      color: #1f6b56;
    }

    &--warning {
      background: #f7eee2;
      color: #9b5d16;
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
