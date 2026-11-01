import type { ClipForgeApi } from '../../shared/types'

declare global {
  interface Window {
    api: ClipForgeApi
  }
}

export {}
