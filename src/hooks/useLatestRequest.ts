import { ref } from 'vue'

interface LatestRequestOptions<T> {
  onSuccess?: (data: T) => void
  onError?: (error: unknown) => void
  onFinally?: () => void
}

export function useLatestRequest() {
  const loading = ref(false)
  let requestSeq = 0

  async function runLatest<T>(request: () => Promise<T>, options: LatestRequestOptions<T> = {}) {
    const currentSeq = ++requestSeq
    loading.value = true

    try {
      const data = await request()

      if (currentSeq !== requestSeq) {
        return undefined
      }

      options.onSuccess?.(data)
      return data
    }
    catch (error) {
      if (currentSeq === requestSeq) {
        options.onError?.(error)
      }

      return undefined
    }
    finally {
      if (currentSeq === requestSeq) {
        loading.value = false
        options.onFinally?.()
      }
    }
  }

  return {
    loading,
    runLatest,
  }
}
