<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue'
import FormField from '@/components/FormField.vue'
import FormSection from '@/components/FormSection.vue'
import type { PackageStatus, ShrimpPackage } from '@/api/types/home'
import { deletePackage, getManagePackages, savePackage, updatePackageStatus } from '@/api/package'
import { useLatestRequest } from '@/hooks/useLatestRequest'
import { useNativeLoading } from '@/hooks/useNativeLoading'
import { markHomeDataDirty } from '@/utils/homeDataRefresh'

definePage({
  style: {
    navigationBarTitleText: '套餐管理',
    enablePullDownRefresh: true,
  },
})

interface PackageForm {
  packageId: string
  name: string
  description: string
  durationMinutes: string
  priceYuan: string
  rodCount: string
  maxPeople: string
  sort: string
  status: PackageStatus
}

const defaultForm: PackageForm = {
  packageId: '',
  name: '',
  description: '',
  durationMinutes: '',
  priceYuan: '',
  rodCount: '1',
  maxPeople: '1',
  sort: '0',
  status: 'active',
}
const statusOptions: Array<{ label: string, value: PackageStatus }> = [
  { label: '启用', value: 'active' },
  { label: '停用', value: 'disabled' },
]

const errorText = ref('')
const canEdit = ref(false)
const packageList = ref<ShrimpPackage[]>([])
const hasFetched = ref(false)
const showForm = ref(false)
const saving = ref(false)
const updatingStatusId = ref('')
const deletingPackageId = ref('')
const form = reactive<PackageForm>({ ...defaultForm })
const { loading: requestLoading, runLatest } = useLatestRequest()
const showInitialLoading = computed(() => requestLoading.value && !hasFetched.value)
const showLoadingOverlay = computed(() => requestLoading.value && hasFetched.value)
const statusIndex = computed(() => Math.max(statusOptions.findIndex(item => item.value === form.status), 0))
const formTitle = computed(() => form.packageId ? '编辑套餐' : '新增套餐')
useNativeLoading(showLoadingOverlay, '加载中')

async function fetchPackages() {
  errorText.value = ''

  await runLatest(
    () => getManagePackages(),
    {
      onSuccess: (res) => {
        packageList.value = res.rows || []
        canEdit.value = !!res.canEdit
        hasFetched.value = true
      },
      onError: (error) => {
        errorText.value = error instanceof Error ? error.message : '套餐获取失败'
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

function handleEdit(packageItem: ShrimpPackage) {
  if (!canEdit.value) {
    showNoEditToast()
    return
  }

  Object.assign(form, {
    packageId: packageItem._id,
    name: packageItem.name || '',
    description: packageItem.description || '',
    durationMinutes: `${packageItem.durationMinutes || ''}`,
    priceYuan: formatPriceInput(packageItem.price),
    rodCount: `${packageItem.rodCount || 1}`,
    maxPeople: `${packageItem.maxPeople || packageItem.rodCount || 1}`,
    sort: `${packageItem.sort || 0}`,
    status: packageItem.status || 'active',
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
  const durationMinutes = toPositiveInteger(form.durationMinutes)
  const price = toPriceCent(form.priceYuan)
  const rodCount = toPositiveInteger(form.rodCount)
  const maxPeople = toPositiveInteger(form.maxPeople)
  const sort = toInteger(form.sort)

  if (!name) {
    showToast('请填写套餐名称')
    return
  }

  if (durationMinutes <= 0) {
    showToast('请填写有效套餐时长')
    return
  }

  if (price <= 0) {
    showToast('请填写有效套餐价格')
    return
  }

  if (rodCount <= 0) {
    showToast('请填写有效杆数')
    return
  }

  if (maxPeople <= 0) {
    showToast('请填写有效建议人数')
    return
  }

  saving.value = true

  try {
    await savePackage({
      ...(form.packageId ? { packageId: form.packageId } : {}),
      name,
      description,
      durationMinutes,
      price,
      rodCount,
      maxPeople,
      sort,
      status: form.status,
    })
    markHomeDataDirty()
    showToast('保存成功', 'success')
    showForm.value = false
    resetForm()
    await fetchPackages()
  }
  catch (error) {
    showToast(error instanceof Error ? error.message : '套餐保存失败')
  }
  finally {
    saving.value = false
  }
}

async function handleToggleStatus(packageItem: ShrimpPackage) {
  if (!canEdit.value || updatingStatusId.value) {
    return
  }

  const nextStatus: PackageStatus = packageItem.status === 'active' ? 'disabled' : 'active'
  updatingStatusId.value = packageItem._id

  try {
    await updatePackageStatus({
      packageId: packageItem._id,
      status: nextStatus,
    })
    markHomeDataDirty()
    showToast(nextStatus === 'active' ? '已启用' : '已停用', 'success')
    await fetchPackages()
  }
  catch (error) {
    showToast(error instanceof Error ? error.message : '套餐状态调整失败')
  }
  finally {
    updatingStatusId.value = ''
  }
}

function handleDelete(packageItem: ShrimpPackage) {
  if (!canEdit.value || deletingPackageId.value) {
    return
  }

  uni.showModal({
    title: '删除套餐',
    content: `确认删除「${packageItem.name}」吗？删除后首页和预约页将不再展示。`,
    confirmText: '删除',
    confirmColor: '#c9472b',
    success: (res) => {
      if (res.confirm) {
        submitDelete(packageItem)
      }
    },
  })
}

async function submitDelete(packageItem: ShrimpPackage) {
  deletingPackageId.value = packageItem._id

  try {
    await deletePackage({
      packageId: packageItem._id,
    })
    packageList.value = packageList.value.filter(item => item._id !== packageItem._id)
    markHomeDataDirty()
    showToast('删除成功', 'success')

    if (form.packageId === packageItem._id) {
      showForm.value = false
      resetForm()
    }

    await fetchPackages()
  }
  catch (error) {
    showToast(error instanceof Error ? error.message : '套餐删除失败')
  }
  finally {
    deletingPackageId.value = ''
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
  const safeMinutes = minutes || 0
  const hours = Math.floor(safeMinutes / 60)
  const restMinutes = safeMinutes % 60

  if (hours && restMinutes) {
    return `${hours}小时${restMinutes}分钟`
  }

  if (hours) {
    return `${hours}小时`
  }

  return `${restMinutes}分钟`
}

function showNoEditToast() {
  showToast('服务员仅可查看套餐')
}

function showToast(title: string, icon: UniApp.ShowToastOptions['icon'] = 'none') {
  uni.showToast({
    title,
    icon,
  })
}

onLoad(() => {
  fetchPackages()
})

onPullDownRefresh(() => {
  fetchPackages()
})
</script>

<template>
  <view class="package-manage-page">
    <view class="package-toolbar">
      <view>
        <view class="package-toolbar__title">
          套餐管理
        </view>
        <view class="package-toolbar__desc">
          {{ canEdit ? '维护顾客可预约的固定套餐' : '当前角色仅可查看套餐' }}
        </view>
      </view>
      <ActionButton
        v-if="canEdit"
        class="package-toolbar__btn"
        label="新增"
        block
        size="small"
        :disabled="saving"
        @click="handleCreate"
      />
    </view>

    <FormSection v-if="showForm" :title="formTitle">
      <template #action>
        <ActionButton class="package-form__close" label="取消" block variant="ghost" size="small" :disabled="saving" @click="handleCancelForm" />
      </template>

      <FormField label="套餐名称">
        <input v-model.trim="form.name" class="form-field__input" :maxlength="30" placeholder="例如 双人畅钓 2 小时">
      </FormField>

      <FormField label="套餐描述">
        <textarea v-model.trim="form.description" class="form-field__textarea" :maxlength="80" placeholder="给顾客看的简短说明" />
      </FormField>

      <view class="form-grid">
        <FormField compact label="价格（元）">
          <input v-model.trim="form.priceYuan" class="form-field__input" type="digit" placeholder="128">
        </FormField>
        <FormField compact label="时长（分钟）">
          <input v-model.trim="form.durationMinutes" class="form-field__input" type="number" placeholder="120">
        </FormField>
        <FormField compact label="杆数">
          <input v-model.trim="form.rodCount" class="form-field__input" type="number" placeholder="2">
        </FormField>
        <FormField compact label="建议人数">
          <input v-model.trim="form.maxPeople" class="form-field__input" type="number" placeholder="2">
        </FormField>
        <FormField compact label="排序">
          <input v-model.trim="form.sort" class="form-field__input" type="number" placeholder="0">
        </FormField>
        <FormField compact label="状态">
          <picker :value="statusIndex" :range="statusOptions" range-key="label" @change="handleStatusChange">
            <view class="form-field__picker">
              {{ statusOptions[statusIndex]?.label || '启用' }}
            </view>
          </picker>
        </FormField>
      </view>

      <template #actions>
        <ActionButton class="package-form__submit" block label="保存套餐" loading-text="保存中..." :loading="saving" variant="secondary" size="large" @click="handleSave" />
      </template>
    </FormSection>

    <view class="package-content">
      <view v-if="showInitialLoading" class="package-placeholder">
        正在加载套餐...
      </view>
      <view v-else-if="errorText" class="package-placeholder package-placeholder--error">
        <text>{{ errorText }}</text>
        <ActionButton class="package-placeholder__btn" label="重试" @click="fetchPackages" />
      </view>
      <view v-else-if="!packageList.length" class="package-placeholder">
        暂无套餐
      </view>
      <view v-else class="package-list">
        <view v-for="packageItem in packageList" :key="packageItem._id" class="package-card">
          <view class="package-card__header">
            <view class="package-card__name">
              {{ packageItem.name }}
            </view>
            <view class="package-card__status" :class="{ 'package-card__status--disabled': packageItem.status !== 'active' }">
              {{ packageItem.status === 'active' ? '启用' : '停用' }}
            </view>
          </view>
          <view class="package-card__desc">
            {{ packageItem.description || '暂无描述' }}
          </view>
          <view class="package-card__meta">
            <text>{{ formatDuration(packageItem.durationMinutes) }}</text>
            <text>{{ packageItem.rodCount }} 支杆</text>
            <text>建议 {{ packageItem.maxPeople }} 人</text>
            <text>排序 {{ packageItem.sort || 0 }}</text>
          </view>
          <view class="package-card__footer">
            <view class="package-card__price">
              {{ formatPrice(packageItem.price) }}
            </view>
            <view v-if="canEdit" class="package-card__actions">
              <ActionButton class="package-card__btn" label="编辑" block variant="ghost" size="small" @click="handleEdit(packageItem)" />
              <ActionButton
                class="package-card__btn"
                block
                :variant="packageItem.status === 'active' ? 'warning' : 'primary'"
                size="small"
                :label="packageItem.status === 'active' ? '停用' : '启用'"
                loading-text="处理中"
                :loading="updatingStatusId === packageItem._id"
                :disabled="updatingStatusId === packageItem._id"
                @click="handleToggleStatus(packageItem)"
              />
              <ActionButton
                class="package-card__btn"
                block
                variant="danger-outline"
                size="small"
                label="删除"
                loading-text="删除中"
                :loading="deletingPackageId === packageItem._id"
                :disabled="deletingPackageId === packageItem._id"
                @click="handleDelete(packageItem)"
              />
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.package-manage-page {
  min-height: 100vh;
  background: #f4f7f2;
  padding: 24rpx 28rpx 48rpx;
  color: #17211d;
}

.package-toolbar,
.package-form,
.package-card,
.package-placeholder {
  border-radius: 8rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);
}

.package-toolbar {
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
  }
}

.package-form {
  &__close {
    width: 112rpx;
    color: #52615b;
  }
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20rpx;
}

.form-field {
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

.package-content {
  margin-top: 22rpx;
}

.package-placeholder {
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

.package-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.package-card {
  padding: 26rpx;

  &__header,
  &__footer,
  &__actions,
  &__meta {
    display: flex;
    align-items: center;
  }

  &__header,
  &__footer {
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
    margin-top: 22rpx;
    border-top: 2rpx solid #eef2ef;
    padding-top: 18rpx;
  }

  &__price {
    flex-shrink: 0;
    color: #c9472b;
    font-size: 32rpx;
    font-weight: 700;
    line-height: 1.2;
  }

  &__actions {
    justify-content: flex-end;
    gap: 12rpx;
  }

  &__btn {
    min-width: 108rpx;
  }
}
</style>
