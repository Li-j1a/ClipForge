<script setup lang="ts">
import { useAppStore } from '../stores/app'
import { formatBytes, formatDuration, formatFps } from '../utils/format'

const store = useAppStore()

function resolution(v: { width: number | null; height: number | null }): string {
  if (v.width == null || v.height == null) return '—'
  return `${v.width}×${v.height}`
}
</script>

<template>
  <div class="video-list panel">
    <div class="video-list-head">
      <div class="video-list-title">
        视频列表
        <span v-if="store.videos.length" class="count-badge">{{ store.videos.length }}</span>
      </div>
      <button
        v-if="store.videos.length"
        class="btn btn-ghost btn-sm"
        :disabled="store.importing"
        @click="store.clearVideos()"
      >
        清空列表
      </button>
    </div>

    <div v-if="!store.videos.length" class="video-list-empty">尚未添加视频</div>

    <ul v-else class="video-items">
      <li v-for="v in store.videos" :key="v.path" class="video-item" :class="{ error: v.error }">
        <template v-if="v.info">
          <div class="thumb">
            <img v-if="v.info.thumbnailDataUrl" :src="v.info.thumbnailDataUrl" :alt="v.info.name" />
            <span v-else class="thumb-placeholder">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path d="m10 9 5 3-5 3z" />
              </svg>
            </span>
          </div>
          <div class="video-meta">
            <div class="video-name" :title="v.info.path">{{ v.info.name }}</div>
            <div class="chips">
              <span class="chip">{{ formatBytes(v.info.fileSize) }}</span>
              <span class="chip">{{ formatDuration(v.info.duration) }}</span>
              <span class="chip">{{ resolution(v.info) }}</span>
              <span class="chip" v-if="v.info.videoCodec">{{ v.info.videoCodec }}</span>
              <span class="chip" v-if="v.info.frameRate">{{ formatFps(v.info.frameRate) }} fps</span>
            </div>
          </div>
          <button class="remove-btn" title="移除" @click="store.removeVideo(v.path)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </template>
        <template v-else>
          <div class="thumb">
            <span class="thumb-placeholder error-thumb">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </span>
          </div>
          <div class="video-meta">
            <div class="video-name" :title="v.path">{{ v.path }}</div>
            <div class="video-error-text">{{ v.error }}</div>
          </div>
          <button class="remove-btn" title="移除" @click="store.removeVideo(v.path)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </template>
      </li>
    </ul>
  </div>
</template>
