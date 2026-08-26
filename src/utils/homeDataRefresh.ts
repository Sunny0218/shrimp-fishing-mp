const HOME_DATA_DIRTY_KEY = 'home_data_dirty'

export function markHomeDataDirty() {
  uni.setStorageSync(HOME_DATA_DIRTY_KEY, true)
}

export function consumeHomeDataDirty() {
  const isDirty = !!uni.getStorageSync(HOME_DATA_DIRTY_KEY)

  if (isDirty) {
    uni.removeStorageSync(HOME_DATA_DIRTY_KEY)
  }

  return isDirty
}
