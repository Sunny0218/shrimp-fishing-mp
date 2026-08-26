<script setup lang="ts">
import type { BookingMode, BusinessHour, ShopSettings } from '@/api/types/home'
import { defaultHomeData, getHomeData, saveShopSettings } from '@/api/home'
import { useNativeLoading } from '@/hooks/useNativeLoading'
import { markHomeDataDirty } from '@/utils/homeDataRefresh'

definePage({
  style: {
    navigationBarTitleText: '门店信息',
    enablePullDownRefresh: true,
  },
})

interface SettingsForm {
  shopName: string
  address: string
  phone: string
  notice: string
  bookingMode: BookingMode
  businessHours: BusinessHour[]
}

const defaultHour: BusinessHour = {
  label: '今日营业',
  startTime: '10:00',
  endTime: '22:00',
}
const bookingModeOptions: Array<{ label: string, value: BookingMode, desc: string }> = [
  { label: '到店安排', value: 'walk_in', desc: '首页只展示套餐，顾客预约后到店核销开始计时' },
  { label: '按场次预约', value: 'slot', desc: '预留给后续按日期和时间段预约' },
]
const form = reactive<SettingsForm>({
  shopName: '',
  address: '',
  phone: '',
  notice: '',
  bookingMode: 'walk_in',
  businessHours: [{ ...defaultHour }],
})
const loading = ref(false)
const saving = ref(false)
const errorText = ref('')
const hasFetched = ref(false)
const bookingModeIndex = computed(() => Math.max(bookingModeOptions.findIndex(item => item.value === form.bookingMode), 0))
const showLoadingOverlay = computed(() => loading.value && hasFetched.value)
useNativeLoading(showLoadingOverlay, '加载中')

function fillForm(settings: ShopSettings) {
  form.shopName = settings.shopName || ''
  form.address = settings.address || ''
  form.phone = settings.phone || ''
  form.notice = settings.notice || ''
  form.bookingMode = settings.bookingMode || 'walk_in'
  form.businessHours = normalizeBusinessHours(settings.businessHours)
}

function normalizeBusinessHours(hours?: BusinessHour[]) {
  if (!Array.isArray(hours) || !hours.length) {
    return [{ ...defaultHour }]
  }

  return hours.map(item => ({
    label: item.label || '营业',
    startTime: item.startTime || defaultHour.startTime,
    endTime: item.endTime || defaultHour.endTime,
  }))
}

async function fetchSettings() {
  loading.value = true
  errorText.value = ''

  try {
    const data = await getHomeData()
    fillForm(data.settings)
  }
  catch (error) {
    errorText.value = error instanceof Error ? error.message : '门店信息获取失败'
  }
  finally {
    loading.value = false
    hasFetched.value = true
    uni.stopPullDownRefresh()
  }
}

function handleBookingModeChange(event: { detail: { value: number | string } }) {
  const index = Number(event.detail.value)
  const option = bookingModeOptions[index]

  if (option) {
    form.bookingMode = option.value
  }
}

function handleTimeChange(index: number, field: 'startTime' | 'endTime', event: { detail: { value: string } }) {
  const target = form.businessHours[index]

  if (target) {
    target[field] = event.detail.value
  }
}

function handleAddHour() {
  form.businessHours.push({ ...defaultHour, label: '营业' })
}

function handleRemoveHour(index: number) {
  if (form.businessHours.length <= 1) {
    showToast('至少保留一条营业时间')
    return
  }

  form.businessHours.splice(index, 1)
}

async function handleSave() {
  if (saving.value) {
    return
  }

  const shopName = form.shopName.trim()
  const address = form.address.trim()
  const phone = form.phone.trim()
  const notice = form.notice.trim()
  const businessHours = form.businessHours.map(item => ({
    label: item.label.trim() || '营业',
    startTime: item.startTime,
    endTime: item.endTime,
  }))

  if (!shopName) {
    showToast('请填写门店名称')
    return
  }

  if (!address) {
    showToast('请填写门店地址')
    return
  }

  if (!businessHours.length || businessHours.some(item => !item.startTime || !item.endTime)) {
    showToast('请填写营业时间')
    return
  }

  saving.value = true

  try {
    const res = await saveShopSettings({
      shopName,
      address,
      phone,
      notice,
      businessHours,
      bookingMode: form.bookingMode,
    })
    fillForm(res.settings)
    markHomeDataDirty()
    showToast('保存成功', 'success')
  }
  catch (error) {
    showToast(error instanceof Error ? error.message : '门店信息保存失败')
  }
  finally {
    saving.value = false
  }
}

function showToast(title: string, icon: UniApp.ShowToastOptions['icon'] = 'none') {
  uni.showToast({
    title,
    icon,
  })
}

onLoad(() => {
  fillForm(defaultHomeData.settings)
  fetchSettings()
})

onPullDownRefresh(() => {
  fetchSettings()
})
</script>

<template>
  <view class="settings-page">
    <view class="settings-toolbar">
      <view>
        <view class="settings-toolbar__title">
          门店基础信息
        </view>
        <view class="settings-toolbar__desc">
          保存后首页会同步展示最新信息
        </view>
      </view>
    </view>

    <view v-if="!hasFetched && loading" class="settings-placeholder">
      正在加载门店信息...
    </view>

    <view v-else-if="errorText" class="settings-placeholder settings-placeholder--error">
      <text>{{ errorText }}</text>
      <button class="settings-placeholder__btn" @click="fetchSettings">
        重试
      </button>
    </view>

    <view v-else class="settings-form">
      <view class="form-field">
        <view class="form-field__label">
          门店名称
        </view>
        <input v-model.trim="form.shopName" class="form-field__input" :maxlength="30" placeholder="例如 钓虾乐园">
      </view>

      <view class="form-field">
        <view class="form-field__label">
          门店地址
        </view>
        <input v-model.trim="form.address" class="form-field__input" :maxlength="80" placeholder="请输入门店地址">
      </view>

      <view class="form-field">
        <view class="form-field__label">
          联系电话
        </view>
        <input v-model.trim="form.phone" class="form-field__input" type="tel" :maxlength="30" placeholder="用于首页一键联系">
      </view>

      <view class="form-field">
        <view class="form-field__label">
          预约模式
        </view>
        <picker :value="bookingModeIndex" :range="bookingModeOptions" range-key="label" @change="handleBookingModeChange">
          <view class="form-field__picker">
            {{ bookingModeOptions[bookingModeIndex]?.label || '到店安排' }}
          </view>
        </picker>
        <view class="form-field__help">
          {{ bookingModeOptions[bookingModeIndex]?.desc }}
        </view>
      </view>

      <view class="settings-section">
        <view class="settings-section__header">
          <view class="settings-section__title">
            营业时间
          </view>
          <button class="settings-section__btn" :disabled="saving" @click="handleAddHour">
            新增
          </button>
        </view>

        <view v-for="(hour, index) in form.businessHours" :key="index" class="hour-card">
          <view class="form-field">
            <view class="form-field__label">
              名称
            </view>
            <input v-model.trim="hour.label" class="form-field__input" :maxlength="20" placeholder="例如 周一至周五">
          </view>
          <view class="hour-card__grid">
            <view class="form-field">
              <view class="form-field__label">
                开始
              </view>
              <picker mode="time" :value="hour.startTime" @change="handleTimeChange(index, 'startTime', $event)">
                <view class="form-field__picker">
                  {{ hour.startTime }}
                </view>
              </picker>
            </view>
            <view class="form-field">
              <view class="form-field__label">
                结束
              </view>
              <picker mode="time" :value="hour.endTime" @change="handleTimeChange(index, 'endTime', $event)">
                <view class="form-field__picker">
                  {{ hour.endTime }}
                </view>
              </picker>
            </view>
          </view>
          <button
            v-if="form.businessHours.length > 1"
            class="hour-card__remove"
            :disabled="saving"
            @click="handleRemoveHour(index)"
          >
            删除本条
          </button>
        </view>
      </view>

      <view class="form-field">
        <view class="form-field__label">
          门店公告
        </view>
        <textarea v-model.trim="form.notice" class="form-field__textarea" :maxlength="120" placeholder="展示在首页底部，可填写预约说明或临时通知" />
      </view>

      <button class="settings-form__submit" :disabled="saving" @click="handleSave">
        {{ saving ? '保存中...' : '保存门店信息' }}
      </button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.settings-page {
  min-height: 100vh;
  background: #f4f7f2;
  padding: 24rpx 28rpx 48rpx;
  color: #17211d;
}

.settings-toolbar,
.settings-form,
.settings-placeholder {
  border-radius: 8rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);
}

.settings-toolbar {
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
}

.settings-placeholder {
  margin-top: 22rpx;
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

.settings-form {
  margin-top: 22rpx;
  padding: 28rpx;

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

.settings-section {
  margin-top: 28rpx;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20rpx;
    margin-bottom: 18rpx;
  }

  &__title {
    color: #17211d;
    font-size: 30rpx;
    font-weight: 700;
    line-height: 1.3;
  }

  &__btn {
    width: 112rpx;
    min-height: 56rpx;
    margin: 0;
    border-radius: 8rpx;
    background: #1f6b56;
    color: #ffffff;
    font-size: 24rpx;
    line-height: 56rpx;
  }
}

.form-field {
  margin-top: 20rpx;

  &:first-child {
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
    height: 150rpx;
    padding: 18rpx 20rpx;
    line-height: 1.45;
  }

  &__help {
    margin-top: 10rpx;
    color: #84918c;
    font-size: 22rpx;
    line-height: 1.4;
  }
}

.hour-card {
  border: 2rpx solid #e6eee9;
  border-radius: 8rpx;
  background: #fbfcfb;
  padding: 22rpx;

  & + & {
    margin-top: 18rpx;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18rpx;
    margin-top: 18rpx;

    .form-field {
      margin-top: 0;
    }
  }

  &__remove {
    width: 180rpx;
    min-height: 58rpx;
    margin: 20rpx 0 0;
    border-radius: 8rpx;
    background: #f8ebe7;
    color: #c9472b;
    font-size: 24rpx;
    line-height: 58rpx;
  }
}
</style>
