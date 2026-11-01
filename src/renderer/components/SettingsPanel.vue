<script setup lang="ts">
import { computed } from 'vue'
import type { OutputFormat, Preset } from '../../shared/types'
import { useAppStore } from '../stores/app'
import { FORMAT_LABELS } from '../utils/format'

const store = useAppStore()

const presets: Array<{ id: Preset; label: string; desc: string }> = [
  { id: 'compatibility', label: '兼容性优先', desc: 'H.264 编码，兼容绝大多数设备' },
  { id: 'high-quality', label: '高清画质', desc: '更高码率，保留更多画面细节' },
  { id: 'small-size', label: '节省空间', desc: '优先压缩体积，节省存储空间' },
]

const format = computed<OutputFormat>({
  get: () => store.settings?.defaultFormat ?? 'mp4',
  set: (v) => void store.updateSettings({ defaultFormat: v }),
})

const preset = computed<Preset>({
  get: () => store.settings?.defaultPreset ?? 'compatibility',
  set: (v) => void store.updateSettings({ defaultPreset: v }),
})

const outputDir = computed(() => store.settings?.outputDir ?? '')
const canStart = computed(() => store.hasVideos && !store.importing)

async function pickDir() {
  const dir = await window.api.openDirDialog()
  if (dir) await store.updateSettings({ outputDir: dir })
}
</script>

<template>
  <div class="panel settings-panel">
    <h2 class="panel-title">转换设置</h2>

    <div class="field">
      <label class="field-label">输出格式</label>
      <select v-model="format" class="select">
        <option value="mp4">{{ FORMAT_LABELS.mp4 }}</option>
        <option value="mkv">{{ FORMAT_LABELS.mkv }}</option>
        <option value="webm">{{ FORMAT_LABELS.webm }}</option>
      </select>
    </div>

    <div class="field">
      <label class="field-label">质量预设</label>
      <div class="preset-cards">
        <button
          v-for="p in presets"
          :key="p.id"
          class="preset-card"
          :class="{ active: preset === p.id }"
          @click="preset = p.id"
        >
          <span class="preset-name">{{ p.label }}</span>
          <span class="preset-desc">{{ p.desc }}</span>
        </button>
      </div>
    </div>

    <div class="field">
      <label class="field-label">保存位置</label>
      <div class="dir-row">
        <span class="dir-path" :title="outputDir">{{ outputDir || '未设置' }}</span>
        <button class="btn btn-ghost btn-sm" @click="pickDir">选择目录</button>
      </div>
    </div>

    <button class="btn btn-primary btn-block" :disabled="!canStart" @click="store.startConversion()">
      开始转换
    </button>
    <p v-if="!store.hasVideos" class="start-hint">请先添加视频文件</p>
  </div>
</template>
