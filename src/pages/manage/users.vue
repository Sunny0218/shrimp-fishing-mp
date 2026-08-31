<script setup lang="ts">
import { storeToRefs } from 'pinia'
import ActionButton from '@/components/ActionButton.vue'
import ListFooter from '@/components/ListFooter.vue'
import PageState from '@/components/PageState.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import type { IUserInfoRes, UserRole } from '@/api/types/login'
import { getManageUsers, updateUserRole } from '@/api/user'
import { useLatestRequest } from '@/hooks/useLatestRequest'
import { useNativeLoading } from '@/hooks/useNativeLoading'
import { useUserStore } from '@/store'
import { getRoleText, hasRole, roleManageRoles, roleOptions } from '@/utils/roles'

definePage({
  style: {
    navigationBarTitleText: '员工角色',
    enablePullDownRefresh: true,
  },
})

const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)
const errorText = ref('')
const userList = ref<IUserInfoRes[]>([])
const selectedRoleMap = reactive<Record<string, UserRole>>({})
const updatingUserId = ref('')
const hasFetched = ref(false)
const keywordInput = ref('')
const activeKeyword = ref('')
const activeRoleFilter = ref<UserRole | 'all'>('all')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const hasMore = ref(false)
const { loading, runLatest } = useLatestRequest()
const canManageRoles = computed(() => hasRole(userInfo.value.role, roleManageRoles))
const showInitialLoading = computed(() => loading.value && !hasFetched.value)
const showLoadingOverlay = computed(() => loading.value && hasFetched.value)
const hasActiveFilter = computed(() => !!activeKeyword.value || activeRoleFilter.value !== 'all')
const footerDoneText = computed(() => hasActiveFilter.value ? '没有更多匹配用户' : '没有更多用户')
const roleFilterOptions: Array<{ label: string, value: UserRole | 'all' }> = [
  { label: '全部', value: 'all' },
  { label: '店主', value: 'super_admin' },
  { label: '店长', value: 'admin' },
  { label: '员工', value: 'staff' },
  { label: '顾客', value: 'customer' },
]
useNativeLoading(showLoadingOverlay, '加载中')

async function fetchUsers(options: { reset?: boolean } = {}) {
  if (!canManageRoles.value) {
    errorText.value = '仅超级管理员可管理角色'
    hasFetched.value = true
    uni.stopPullDownRefresh()
    return
  }

  errorText.value = ''
  const isReset = options.reset !== false
  const nextPage = isReset ? 1 : page.value + 1

  if (!isReset && (!hasMore.value || loading.value)) {
    return
  }

  await runLatest(
    () => getManageUsers({
      page: nextPage,
      pageSize,
      keyword: activeKeyword.value,
      roleFilter: activeRoleFilter.value,
    }),
    {
      onSuccess: (res) => {
        const rows = res.rows || []

        userList.value = isReset ? rows : [...userList.value, ...rows]
        page.value = res.page || nextPage
        total.value = res.total || 0
        hasMore.value = !!res.hasMore
        syncSelectedRoles()
        hasFetched.value = true
      },
      onError: (error) => {
        errorText.value = error instanceof Error ? error.message : '用户列表获取失败'
        hasFetched.value = true
      },
      onFinally: () => {
        uni.stopPullDownRefresh()
      },
    },
  )
}

function handleSearch() {
  activeKeyword.value = keywordInput.value.trim()
  fetchUsers({ reset: true })
}

function handleClearSearch() {
  if (!keywordInput.value && !activeKeyword.value) {
    return
  }

  keywordInput.value = ''
  activeKeyword.value = ''
  fetchUsers({ reset: true })
}

function handleRoleFilterChange(role: UserRole | 'all') {
  if (activeRoleFilter.value === role || loading.value) {
    return
  }

  activeRoleFilter.value = role
  fetchUsers({ reset: true })
}

function handleRetry() {
  fetchUsers({ reset: true })
}

function syncSelectedRoles() {
  for (const user of userList.value) {
    if (user._id) {
      selectedRoleMap[user._id] = user.role || 'customer'
    }
  }
}

function getSelectedRole(user: IUserInfoRes) {
  return selectedRoleMap[user._id || ''] || user.role || 'customer'
}

function getRoleIndex(user: IUserInfoRes) {
  const role = getSelectedRole(user)

  return Math.max(roleOptions.findIndex(item => item.value === role), 0)
}

function handleRoleChange(user: IUserInfoRes, event: { detail: { value: number | string } }) {
  const userId = user._id || ''
  const index = Number(event.detail.value)
  const option = roleOptions[index]

  if (!userId || !option) {
    return
  }

  selectedRoleMap[userId] = option.value
}

function hasRoleChanged(user: IUserInfoRes) {
  return getSelectedRole(user) !== (user.role || 'customer')
}

function canUpdateUser(user: IUserInfoRes) {
  return canManageRoles.value && !!user._id && hasRoleChanged(user) && updatingUserId.value !== user._id
}

async function handleUpdateRole(user: IUserInfoRes) {
  const userId = user._id || ''

  if (!canUpdateUser(user)) {
    return
  }

  const nextRole = getSelectedRole(user)

  uni.showModal({
    title: '调整角色',
    content: `确认将该用户角色调整为「${getRoleText(nextRole)}」吗？`,
    confirmText: '确认调整',
    confirmColor: '#1f6b56',
    success: async (res) => {
      if (!res.confirm) {
        return
      }

      updatingUserId.value = userId

      try {
        const result = await updateUserRole({
          userId,
          role: nextRole,
        })
        const index = userList.value.findIndex(item => item._id === userId)

        if (index >= 0) {
          userList.value[index] = {
            ...userList.value[index],
            ...result.user,
          }
        }

        selectedRoleMap[userId] = result.user.role || nextRole
        uni.showToast({
          title: '角色已更新',
          icon: 'success',
        })
      }
      catch (error) {
        selectedRoleMap[userId] = user.role || 'customer'
        uni.showToast({
          title: error instanceof Error ? error.message : '角色调整失败',
          icon: 'none',
        })
      }
      finally {
        updatingUserId.value = ''
      }
    },
  })
}

function formatUserName(user: IUserInfoRes) {
  return user.nickname || '未设置昵称'
}

function formatUserMeta(user: IUserInfoRes) {
  const items = [
    user.phone ? `电话 ${user.phone}` : '',
    user.openid && !user.phone ? `openid ${user.openid}` : '',
  ]

  return items.filter(Boolean).join(' · ') || '暂无联系方式'
}

function getRoleBadgeVariant(role?: UserRole): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (role === 'super_admin') {
    return 'warning'
  }

  if (role === 'admin') {
    return 'success'
  }

  if (role === 'staff') {
    return 'info'
  }

  return 'neutral'
}

onLoad(() => {
  fetchUsers({ reset: true })
})

onPullDownRefresh(() => {
  fetchUsers({ reset: true })
})

onReachBottom(() => {
  fetchUsers({ reset: false })
})
</script>

<template>
  <view class="user-role-page">
    <view class="user-role-toolbar">
      <view>
        <view class="user-role-toolbar__title">
          员工角色
        </view>
        <view class="user-role-toolbar__desc">
          设置普通员工、店长和店主权限
        </view>
      </view>
    </view>

    <view v-if="canManageRoles" class="user-search">
      <input
        v-model="keywordInput"
        class="user-search__input"
        placeholder="搜索昵称、手机号或 openid"
        confirm-type="search"
        @confirm="handleSearch"
      >
      <view class="user-search__actions">
        <ActionButton v-if="activeKeyword || keywordInput" label="清空" variant="ghost" size="small" :disabled="loading" @click="handleClearSearch" />
        <ActionButton label="搜索" size="small" :loading="loading" loading-text="搜索中" @click="handleSearch" />
      </view>
    </view>

    <scroll-view v-if="canManageRoles" class="role-filter" scroll-x :show-scrollbar="false">
      <view class="role-filter__inner">
        <view
          v-for="item in roleFilterOptions"
          :key="item.value"
          class="role-filter__item"
          :class="{ 'role-filter__item--active': activeRoleFilter === item.value }"
          @click="handleRoleFilterChange(item.value)"
        >
          {{ item.label }}
        </view>
      </view>
    </scroll-view>

    <view v-if="hasFetched && !errorText && canManageRoles" class="user-summary">
      {{ hasActiveFilter ? `找到 ${total} 个匹配用户` : `共 ${total} 个用户，门店角色优先显示` }}
    </view>

    <PageState v-if="showInitialLoading" text="正在加载用户..." />
    <PageState v-else-if="errorText" :text="errorText" button-text="重试" variant="error" @action="handleRetry" />
    <PageState v-else-if="!userList.length" :text="hasActiveFilter ? '没有匹配用户' : '暂无用户'" />

    <view v-else class="user-list">
      <view v-for="user in userList" :key="user._id || user.openid" class="user-card">
        <view class="user-card__header">
          <view class="user-card__main">
            <view class="user-card__name">
              {{ formatUserName(user) }}
            </view>
            <view class="user-card__meta">
              {{ formatUserMeta(user) }}
            </view>
          </view>
          <StatusBadge :text="getRoleText(user.role)" :variant="getRoleBadgeVariant(user.role)" />
        </view>

        <view class="user-card__role-row">
          <view class="user-card__label">
            调整角色
          </view>
          <picker :value="getRoleIndex(user)" :range="roleOptions" range-key="label" @change="handleRoleChange(user, $event)">
            <view class="user-card__picker">
              {{ getRoleText(getSelectedRole(user)) }}
            </view>
          </picker>
        </view>

        <ActionButton
          class="user-card__btn"
          block
          label="保存角色"
          loading-text="保存中"
          :loading="updatingUserId === user._id"
          :disabled="!canUpdateUser(user)"
          @click="handleUpdateRole(user)"
        />
      </view>

      <ListFooter :loading="loading && hasFetched" :has-more="hasMore" :done-text="footerDoneText" />
    </view>
  </view>
</template>

<style scoped lang="scss">
.user-role-page {
  min-height: 100vh;
  background: #f4f7f2;
  padding: 24rpx 28rpx 48rpx;
  color: #17211d;
}

.user-role-toolbar,
.user-card {
  border-radius: 8rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);
}

.user-role-toolbar {
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

.user-search {
  margin-top: 20rpx;
  border-radius: 8rpx;
  background: #ffffff;
  padding: 24rpx;
  box-shadow: 0 10rpx 22rpx rgb(31 59 50 / 5%);

  &__input {
    box-sizing: border-box;
    width: 100%;
    height: 72rpx;
    border: 2rpx solid #e2ebe6;
    border-radius: 8rpx;
    background: #ffffff;
    padding: 0 22rpx;
    color: #17211d;
    font-size: 25rpx;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 16rpx;
    margin-top: 18rpx;
  }
}

.user-summary {
  margin-top: 18rpx;
  color: #718079;
  font-size: 24rpx;
  line-height: 1.4;
  text-align: center;
}

.role-filter {
  width: 100%;
  margin-top: 18rpx;
  white-space: nowrap;

  &__inner {
    display: inline-flex;
    gap: 16rpx;
    min-width: 100%;
  }

  &__item {
    box-sizing: border-box;
    min-width: 104rpx;
    border-radius: 8rpx;
    background: #ffffff;
    padding: 16rpx 22rpx;
    color: #718079;
    font-size: 25rpx;
    font-weight: 600;
    line-height: 1.2;
    text-align: center;
    box-shadow: 0 8rpx 18rpx rgb(31 59 50 / 4%);

    &--active {
      background: #1f6b56;
      color: #ffffff;
    }
  }
}

.user-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  margin-top: 24rpx;
}

.user-card {
  padding: 28rpx;

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20rpx;
  }

  &__main {
    min-width: 0;
    flex: 1;
  }

  &__name {
    color: #17211d;
    font-size: 30rpx;
    font-weight: 700;
    line-height: 1.3;
  }

  &__meta {
    margin-top: 10rpx;
    color: #718079;
    font-size: 23rpx;
    line-height: 1.45;
    word-break: break-all;
  }

  &__role-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20rpx;
    margin-top: 26rpx;
    border-top: 1rpx solid #edf1ee;
    padding-top: 24rpx;
  }

  &__label {
    color: #718079;
    font-size: 25rpx;
    line-height: 1.3;
  }

  &__picker {
    min-width: 220rpx;
    border-radius: 8rpx;
    background: #eef4f0;
    padding: 18rpx 22rpx;
    color: #1f6b56;
    font-size: 26rpx;
    font-weight: 600;
    line-height: 1.3;
    text-align: center;
  }

  &__btn {
    margin-top: 22rpx;
  }
}
</style>
