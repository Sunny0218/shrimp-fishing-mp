import type { Ref } from 'vue'
import { onUnmounted, watch } from 'vue'

export function useNativeLoading(visible: Ref<boolean>, title = '加载中') {
  watch(
    visible,
    (show) => {
      if (show) {
        uni.showLoading({
          title,
          mask: true,
        })
        return
      }

      uni.hideLoading()
    },
    { immediate: true },
  )

  onUnmounted(() => {
    uni.hideLoading()
  })
}
