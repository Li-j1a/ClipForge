<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../stores/app'
import VideoList from '../components/VideoList.vue'
import SettingsPanel from '../components/SettingsPanel.vue'
import TaskPanel from '../components/TaskPanel.vue'

const store = useAppStore()
const dragging = ref(false)
let dragCount = 0

function onDragEnter(e: DragEvent) {
  e.preventDefault()
  dragCount++
  dragging.value = true
}

function onDragLeave() {
  dragCount--
  if (dragCount <= 0) {
    dragCount = 0
    dragging.value = false
  }
}

function onDrop(e: DragEvent) {
  dragging.value = false
  dragCount = 0
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (!files.length) return
  const paths = files.map((f) => window.api.getPathForFile(f)).filter(Boolean)
  if (paths.length) void store.importVideos(paths)
}

async function pickFiles() {
  const paths = await window.api.openVideoDialog()
  if (paths.length) void store.importVideos(paths)
}
</script>

<template>
  <div
    class="page convert-page"
    @dragenter="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="columns">
      <section class="main-col">
        <div
          class="drop-zone"
          :class="{ dragging, 'has-items': store.videos.length > 0 }"
          role="button"
          tabindex="0"
          @click="pickFiles"
          @keydown.enter="pickFiles"
        >
          <div v-if="store.importing" class="loading-state">
            <span class="spinner" />
            <span>正在读取媒体信息…</span>
          </div>

          <template v-else-if="store.videos.length === 0">
            <svg class="drop-icon" viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 16V4M7 9l5-5 5 5" />
              <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            </svg>
            <p class="drop-title">拖拽视频到这里，或点击选择文件</p>
            <p class="drop-hint">支持 MP4 / MKV / WebM / AVI / MOV / FLV 等常见格式</p>
          </template>

          <template v-else>
            <div class="drop-more">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>拖拽或点击继续添加视频</span>
            </div>
          </template>
        </div>

        <VideoList />
      </section>

      <aside class="side-col">
        <SettingsPanel />
      </aside>
    </div>

    <TaskPanel />
  </div>
</template>
