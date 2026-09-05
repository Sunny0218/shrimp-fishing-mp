<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue'
import PageState from '@/components/PageState.vue'
import type { BookingMode, BusinessHour, NotificationSettings, PaymentMode, ShopSettings } from '@/api/types/home'
import { defaultHomeData, getHomeData, saveShopSettings } from '@/api/home'
import { defaultNotificationSettings, notificationTemplateConfig } from '@/config/notificationTemplates'
import { uploadShopCoverImage } from '@/api/upload'
import { useNativeLoading } from '@/hooks/useNativeLoading'
import { useUserStore } from '@/store'
import { markHomeDataDirty } from '@/utils/homeDataRefresh'
import { hasRole, shopEditRoles } from '@/utils/roles'

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
  coverImages: string[]
  notice: string
  bookingMode: BookingMode
  paymentMode: PaymentMode
  pendingPaymentExpireMinutes: string
  notificationSettings: NotificationSettings
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
const paymentModeOptions: Array<{ label: string, value: PaymentMode, desc: string }> = [
  { label: '自动模拟支付', value: 'mock_auto_paid', desc: '提交预约后自动支付成功，订单直接进入待到店' },
  { label: '停留待支付', value: 'mock_pending_payment', desc: '提交预约后停留在待支付，用于测试支付和未支付取消' },
]
const notificationFieldLabelMap: Record<string, string> = {
  customerName: '预约人',
  appointmentTime: '预约时间',
  appointmentItem: '预约项目',
  appointmentStatus: '预约状态',
  orderNo: '订单编号',
  orderStatus: '订单状态',
  orderAmount: '订单金额',
  updatedAt: '更新时间',
  remark: '温馨提示/备注',
}
const form = reactive<SettingsForm>({
  shopName: '',
  address: '',
  phone: '',
  coverImages: [],
  notice: '',
  bookingMode: 'walk_in',
  paymentMode: 'mock_auto_paid',
  pendingPaymentExpireMinutes: '1',
  notificationSettings: getDefaultNotificationSettings(),
  businessHours: [{ ...defaultHour }],
})
const userStore = useUserStore()
const loading = ref(false)
const saving = ref(false)
const uploadingCoverImage = ref(false)
const errorText = ref('')
const hasFetched = ref(false)
const canEditSettings = computed(() => hasRole(userStore.userInfo.role, shopEditRoles))
const bookingModeIndex = computed(() => Math.max(bookingModeOptions.findIndex(item => item.value === form.bookingMode), 0))
const paymentModeIndex = computed(() => Math.max(paymentModeOptions.findIndex(item => item.value === form.paymentMode), 0))
const showLoadingOverlay = computed(() => loading.value && hasFetched.value)
const notificationTemplateList = computed(() => [
  notificationTemplateConfig.reservationNotice,
  notificationTemplateConfig.orderStatus,
])
useNativeLoading(showLoadingOverlay, '加载中')

function fillForm(settings: ShopSettings) {
  form.shopName = settings.shopName || ''
  form.address = settings.address || ''
  form.phone = settings.phone || ''
  form.coverImages = Array.isArray(settings.coverImages) ? [...settings.coverImages] : []
  form.notice = settings.notice || ''
  form.bookingMode = settings.bookingMode || 'walk_in'
  form.paymentMode = settings.paymentMode || 'mock_auto_paid'
  form.pendingPaymentExpireMinutes = `${settings.pendingPaymentExpireMinutes || 1}`
  form.notificationSettings = normalizeNotificationSettingsForForm(settings.notificationSettings)
  form.businessHours = normalizeBusinessHours(settings.businessHours)
}

function getDefaultNotificationSettings(): NotificationSettings {
  return {
    ...defaultNotificationSettings,
    templates: {
      reservationNotice: {
        ...defaultNotificationSettings.templates.reservationNotice,
        fields: { ...defaultNotificationSettings.templates.reservationNotice.fields },
      },
      orderStatus: {
        ...defaultNotificationSettings.templates.orderStatus,
        fields: { ...defaultNotificationSettings.templates.orderStatus.fields },
      },
    },
  }
}

function normalizeNotificationSettingsForForm(settings?: Partial<NotificationSettings>): NotificationSettings {
  const fallback = getDefaultNotificationSettings()

  return {
    ...fallback,
    ...settings,
    customerEnabled: settings?.customerEnabled ?? fallback.customerEnabled,
    staffEnabled: settings?.staffEnabled ?? fallback.staffEnabled,
    reminderBeforeMinutes: Math.max(Math.floor(Number(settings?.reminderBeforeMinutes || fallback.reminderBeforeMinutes)), 1),
    templates: {
      reservationNotice: {
        ...fallback.templates.reservationNotice,
        ...settings?.templates?.reservationNotice,
        fields: {
          ...fallback.templates.reservationNotice.fields,
          ...settings?.templates?.reservationNotice?.fields,
        },
      },
      orderStatus: {
        ...fallback.templates.orderStatus,
        ...settings?.templates?.orderStatus,
        fields: {
          ...fallback.templates.orderStatus.fields,
          ...settings?.templates?.orderStatus?.fields,
        },
      },
    },
  }
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

function handlePaymentModeChange(event: { detail: { value: number | string } }) {
  const index = Number(event.detail.value)
  const option = paymentModeOptions[index]

  if (option) {
    form.paymentMode = option.value
  }
}

function handleNotificationEnabledChange(field: 'customerEnabled' | 'staffEnabled', event: { detail: { value: boolean } }) {
  form.notificationSettings[field] = event.detail.value
}

function getNotificationFieldLabel(fieldName: string) {
  return notificationFieldLabelMap[fieldName] || fieldName
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

interface ChosenCoverImage {
  tempFilePath: string
  size: number
}

interface ChooseMediaFile {
  tempFilePath?: string
  path?: string
  size?: number
}

function chooseCoverImage() {
  return new Promise<ChosenCoverImage>((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles[0] as ChooseMediaFile | undefined
        const tempFilePath = file?.tempFilePath || file?.path || ''

        if (!tempFilePath) {
          reject(new Error('图片选择失败'))
          return
        }

        resolve({
          tempFilePath,
          size: Number(file?.size || 0),
        })
      },
      fail: (error) => {
        if (error.errMsg?.includes('cancel')) {
          reject(new Error('已取消选择'))
          return
        }

        reject(new Error('图片选择失败'))
      },
    })
    // #endif

    // #ifndef MP-WEIXIN
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0] || ''
        const file = res.tempFiles[0]

        if (!tempFilePath) {
          reject(new Error('图片选择失败'))
          return
        }

        resolve({
          tempFilePath,
          size: Number(file?.size || 0),
        })
      },
      fail: (error) => {
        if (error.errMsg?.includes('cancel')) {
          reject(new Error('已取消选择'))
          return
        }

        reject(new Error('图片选择失败'))
      },
    })
    // #endif
  })
}

async function handleUploadCoverImage() {
  if (uploadingCoverImage.value || saving.value) {
    return
  }

  if (form.coverImages.length >= 3) {
    showToast('最多配置 3 张封面图')
    return
  }

  uploadingCoverImage.value = true

  try {
    const file = await chooseCoverImage()

    if (file.size > 5 * 1024 * 1024) {
      showToast('图片不能超过 5MB')
      return
    }

    const res = await uploadShopCoverImage(file.tempFilePath)
    form.coverImages.push(res.fileID)
    showToast('上传成功', 'success')
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '封面图上传失败'

    if (message !== '已取消选择') {
      showToast(message)
    }
  }
  finally {
    uploadingCoverImage.value = false
  }
}

function handleRemoveCoverImage(index: number) {
  form.coverImages.splice(index, 1)
  showToast('保存后生效并清理云文件')
}

async function handleSave() {
  if (!canEditSettings.value) {
    showToast('仅超级管理员可保存门店信息')
    return
  }

  if (saving.value) {
    return
  }

  const shopName = form.shopName.trim()
  const address = form.address.trim()
  const phone = form.phone.trim()
  const notice = form.notice.trim()
  const coverImages = form.coverImages.map(item => item.trim()).filter(Boolean)
  const pendingPaymentExpireMinutes = Math.max(Math.floor(Number(form.pendingPaymentExpireMinutes)), 0)
  const reminderBeforeMinutes = Math.max(Math.floor(Number(form.notificationSettings.reminderBeforeMinutes)), 0)
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

  if (!Number.isFinite(pendingPaymentExpireMinutes) || pendingPaymentExpireMinutes <= 0) {
    showToast('请填写有效待支付保留时间')
    return
  }

  if (!Number.isFinite(reminderBeforeMinutes) || reminderBeforeMinutes <= 0) {
    showToast('请填写有效提醒提前时间')
    return
  }

  saving.value = true

  try {
    const res = await saveShopSettings({
      shopName,
      address,
      phone,
      coverImages,
      notice,
      businessHours,
      bookingMode: form.bookingMode,
      paymentMode: form.paymentMode,
      pendingPaymentExpireMinutes,
      notificationSettings: {
        ...form.notificationSettings,
        reminderBeforeMinutes,
        templates: getDefaultNotificationSettings().templates,
      },
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

function blockUnauthorizedAccess() {
  hasFetched.value = true
  uni.showToast({
    title: '无权限访问',
    icon: 'none',
  })

  setTimeout(() => {
    uni.navigateBack()
  }, 800)
}

onLoad(() => {
  if (!canEditSettings.value) {
    blockUnauthorizedAccess()
    return
  }

  fillForm(defaultHomeData.settings)
  fetchSettings()
})

onPullDownRefresh(() => {
  if (!canEditSettings.value) {
    uni.stopPullDownRefresh()
    return
  }

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

    <PageState v-if="!canEditSettings" text="仅超级管理员可维护门店信息" />

    <view v-else-if="!hasFetched && loading" class="settings-placeholder">
      正在加载门店信息...
    </view>

    <view v-else-if="errorText" class="settings-placeholder settings-placeholder--error">
      <text>{{ errorText }}</text>
      <ActionButton class="settings-placeholder__btn" label="重试" @tap="fetchSettings" />
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

      <view class="settings-section">
        <view class="settings-section__header">
          <view class="settings-section__title">
            首页封面图
          </view>
          <ActionButton class="settings-section__btn settings-section__btn--wide" label="上传" block loading-text="上传中" size="small" :loading="uploadingCoverImage" :disabled="saving || uploadingCoverImage" @tap="handleUploadCoverImage" />
        </view>

        <view v-if="!form.coverImages.length" class="settings-empty">
          未配置封面图，首页将使用主题背景
        </view>
        <view v-for="(imageUrl, index) in form.coverImages" :key="index" class="cover-card">
          <image v-if="imageUrl" class="cover-card__preview" :src="imageUrl" mode="aspectFill" />
          <view v-else class="cover-card__placeholder">
            预览图
          </view>
          <view class="cover-card__content">
            <view class="form-field">
              <view class="form-field__label">
                云存储地址
              </view>
              <input v-model.trim="form.coverImages[index]" class="form-field__input" :maxlength="300" placeholder="上传后自动填入 cloud:// 地址">
            </view>
            <view class="cover-card__actions">
              <ActionButton class="cover-card__remove" label="删除" block variant="danger-outline" size="small" :disabled="saving" @tap="handleRemoveCoverImage(index)" />
            </view>
          </view>
        </view>
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

      <view class="form-field">
        <view class="form-field__label">
          支付模式
        </view>
        <picker :value="paymentModeIndex" :range="paymentModeOptions" range-key="label" @change="handlePaymentModeChange">
          <view class="form-field__picker">
            {{ paymentModeOptions[paymentModeIndex]?.label || '自动模拟支付' }}
          </view>
        </picker>
        <view class="form-field__help">
          {{ paymentModeOptions[paymentModeIndex]?.desc }}
        </view>
      </view>

      <view class="form-field">
        <view class="form-field__label">
          待支付保留时间
        </view>
        <input v-model.trim="form.pendingPaymentExpireMinutes" class="form-field__input" type="number" placeholder="1">
        <view class="form-field__help">
          测试阶段默认 1 分钟，超时后订单自动关闭
        </view>
      </view>

      <view class="settings-section">
        <view class="settings-section__header">
          <view class="settings-section__title">
            提醒设置
          </view>
        </view>

        <view class="switch-row">
          <view>
            <view class="switch-row__title">
              顾客提醒
            </view>
            <view class="switch-row__desc">
              预约、到点和待结账提醒使用顾客授权
            </view>
          </view>
          <switch color="#1f6b56" :checked="form.notificationSettings.customerEnabled" @change="handleNotificationEnabledChange('customerEnabled', $event)" />
        </view>

        <view class="switch-row">
          <view>
            <view class="switch-row__title">
              员工提醒
            </view>
            <view class="switch-row__desc">
              服务员和管理员授权后接收订单提醒
            </view>
          </view>
          <switch color="#1f6b56" :checked="form.notificationSettings.staffEnabled" @change="handleNotificationEnabledChange('staffEnabled', $event)" />
        </view>

        <view class="form-field">
          <view class="form-field__label">
            快到点提前分钟数
          </view>
          <input v-model.trim="form.notificationSettings.reminderBeforeMinutes" class="form-field__input" type="number" placeholder="10">
        </view>

        <view v-for="template in notificationTemplateList" :key="template.templateId" class="template-card">
          <view class="template-card__title">
            {{ template.title }}
          </view>
          <view class="template-card__id">
            {{ template.templateId }}
          </view>
          <view class="template-card__fields">
            <view v-for="(fieldCode, fieldName) in template.fields" :key="fieldName" class="template-card__field">
              <text>{{ getNotificationFieldLabel(fieldName) }}</text>
              <text>{{ fieldCode }}</text>
            </view>
          </view>
        </view>
      </view>

      <view class="settings-section">
        <view class="settings-section__header">
          <view class="settings-section__title">
            营业时间
          </view>
          <ActionButton class="settings-section__btn" label="新增" block size="small" :disabled="saving" @tap="handleAddHour" />
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
          <view v-if="form.businessHours.length > 1" class="hour-card__actions">
            <ActionButton
              class="hour-card__remove"
              label="删除本条"
              block
              variant="danger-outline"
              size="small"
              :disabled="saving"
              @tap="handleRemoveHour(index)"
            />
          </view>
        </view>
      </view>

      <view class="form-field">
        <view class="form-field__label">
          门店公告
        </view>
        <textarea v-model.trim="form.notice" class="form-field__textarea" :maxlength="120" placeholder="展示在首页底部，可填写预约说明或临时通知" />
      </view>

      <view class="settings-form__actions">
        <ActionButton class="settings-form__submit" block label="保存门店信息" loading-text="保存中..." :loading="saving" variant="secondary" size="large" @tap="handleSave" />
      </view>
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
    margin-top: 22rpx;
  }
}

.settings-form {
  margin-top: 22rpx;
  padding: 28rpx;

  &__actions {
    margin-top: 28rpx;
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

    &--wide {
      width: 136rpx;
    }
  }
}

.settings-empty {
  border-radius: 8rpx;
  background: #f4f7f2;
  padding: 28rpx 20rpx;
  color: #84918c;
  font-size: 24rpx;
  line-height: 1.4;
  text-align: center;
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

.cover-card {
  display: flex;
  gap: 18rpx;
  border: 2rpx solid #e6eee9;
  border-radius: 8rpx;
  background: #fbfcfb;
  padding: 18rpx;

  & + & {
    margin-top: 18rpx;
  }

  &__preview,
  &__placeholder {
    flex-shrink: 0;
    width: 160rpx;
    height: 120rpx;
    border-radius: 8rpx;
  }

  &__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #eef2ef;
    color: #84918c;
    font-size: 23rpx;
  }

  &__content {
    min-width: 0;
    flex: 1;

    .form-field {
      margin-top: 0;
    }
  }

  &__remove {
    width: 128rpx;
  }

  &__actions {
    margin-top: 16rpx;
  }
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  border: 2rpx solid #e6eee9;
  border-radius: 8rpx;
  background: #fbfcfb;
  padding: 22rpx;

  & + & {
    margin-top: 18rpx;
  }

  &__title {
    color: #17211d;
    font-size: 27rpx;
    font-weight: 700;
    line-height: 1.35;
  }

  &__desc {
    margin-top: 8rpx;
    color: #84918c;
    font-size: 22rpx;
    line-height: 1.4;
  }
}

.template-card {
  margin-top: 18rpx;
  border: 2rpx solid #dfe8e3;
  border-radius: 8rpx;
  background: #fbfcfb;
  padding: 22rpx;

  &__title {
    color: #17352f;
    font-size: 27rpx;
    font-weight: 700;
    line-height: 1.3;
  }

  &__id {
    margin-top: 10rpx;
    word-break: break-all;
    color: #718079;
    font-size: 21rpx;
    line-height: 1.45;
  }

  &__fields {
    display: grid;
    gap: 10rpx;
    margin-top: 18rpx;
  }

  &__field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
    border-radius: 8rpx;
    background: #f4f7f2;
    padding: 12rpx 16rpx;
    color: #718079;
    font-size: 22rpx;
    line-height: 1.35;
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
  }

  &__actions {
    margin-top: 20rpx;
  }
}
</style>
