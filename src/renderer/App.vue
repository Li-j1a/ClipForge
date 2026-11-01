<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useAppStore, type PageId } from './stores/app'
import ConvertPage from './pages/ConvertPage.vue'
import HistoryPage from './pages/HistoryPage.vue'
import SettingsPage from './pages/SettingsPage.vue'

const store = useAppStore()

const nav: Array<{ id: PageId; label: string }> = [
  { id: 'convert', label: '转换任务' },
  { id: 'history', label: '转换历史' },
  { id: 'settings', label: '设置' },
]

onMounted(() => {
  void store.init()
})

onUnmounted(() => {
  store.dispose()
})
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="3" />
          <path d="M2 9h20M7.5 4v5M12 4v5M16.5 4v5" />
          <path d="M5 15h5" />
        </svg>
        <span class="brand-name">ClipForge</span>
      </div>

      <nav class="nav">
        <button
          v-for="item in nav"
          :key="item.id"
          class="nav-item"
          :class="{ active: store.activePage === item.id }"
          @click="store.setPage(item.id)"
        >
          <svg v-if="item.id === 'convert'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4" />
          </svg>
          <svg v-else-if="item.id === 'history'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
          </svg>
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <div class="ffmpeg-status" :class="{ error: !store.ffmpeg?.ok }">
          <span class="dot" />
          <div class="ffmpeg-text">
            <span class="ffmpeg-label">FFmpeg</span>
            <span class="ffmpeg-sub">{{ store.ffmpeg?.ok ? '可用' : '不可用' }}</span>
          </div>
          <button v-if="!store.ffmpeg?.ok" class="ffmpeg-link" @click="store.setPage('settings')">去设置</button>
        </div>
      </div>
    </aside>

    <main class="content">
      <ConvertPage v-if="store.activePage === 'convert'" />
      <HistoryPage v-else-if="store.activePage === 'history'" />
      <SettingsPage v-else />
    </main>

    <div v-if="store.notice" class="notice" role="alert">
      <span>{{ store.notice }}</span>
      <button class="notice-close" title="关闭" @click="store.clearNotice()">×</button>
    </div>
  </div>
</template>
