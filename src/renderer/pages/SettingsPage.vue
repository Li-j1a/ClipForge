<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { OutputFormat, Preset } from '../../shared/types'
import { useAppStore } from '../stores/app'
import { FORMAT_LABELS, PRESET_LABELS } from '../utils/format'

const store = useAppStore()

const ffmpegPath = ref('')
const ffprobePath = ref('')
let pathsSeeded = false

watch(
  () => store.settings,
  (s) => {
    if (s && !pathsSeeded) {
      ffmpegPath.value = s.ffmpegPath ?? ''
      ffprobePath.value = s.ffprobePath ?? ''
      pathsSeeded = true
    }
  },
  { immediate: true },
)

const format = computed<OutputFormat>({
  get: () => store.settings?.defaultFormat ?? 'mp4',
  set: (v) => void store.updateSettings({ defaultFormat: v }),
})

const preset = computed<Preset>({
  get: () => store.settings?.defaultPreset ?? 'compatibility',
  set: (v) => void store.updateSettings({ defaultPreset: v }),
})

const outputDir = computed(() => store.settings?.outputDir ?? '')

const fileInput = ref<HTMLInputElement | null>(null)
let browseTarget: 'ffmpeg' | 'ffprobe' = 'ffmpeg'

function browse(kind: 'ffmpeg' | 'ffprobe') {
  browseTarget = kind
  fileInput.value?.click()
}

function onFileChosen(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const path = window.api.getPathForFile(file)
  if (browseTarget === 'ffmpeg') ffmpegPath.value = path
  else ffprobePath.value = path
  input.value = ''
}

async function savePaths() {
  await store.setFfmpegPaths({
    ffmpegPath: ffmpegPath.value.trim() || null,
    ffprobePath: ffprobePath.value.trim() || null,
  })
}

async function pickDir() {
  const dir = await window.api.openDirDialog()
  if (dir) await store.updateSettings({ outputDir: dir })
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1 class="page-title">设置</h1>
    </div>

    <div class="settings-grid">
      <section class="panel">
        <h2 class="panel-title">FFmpeg 状态</h2>
        <div class="status-card">
          <div class="status-line">
            <span class="dot" :class="store.ffmpeg?.ok ? 'ok' : 'error'" />
            <span class="status-main">{{ store.ffmpeg?.ok ? '可用' : '不可用' }}</span>
            <button class="btn btn-ghost btn-sm" @click="store.loadFfmpeg()">重新检测</button>
          </div>
          <dl class="status-meta">
            <div class="status-row"><dt>版本</dt><dd>{{ store.ffmpeg?.version ?? '—' }}</dd></div>
            <div class="status-row"><dt>FFmpeg</dt><dd class="mono">{{ store.ffmpeg?.ffmpegPath ?? '内置' }}</dd></div>
            <div class="status-row"><dt>FFprobe</dt><dd class="mono">{{ store.ffmpeg?.ffprobePath ?? '内置' }}</dd></div>
            <div v-if="store.ffmpeg?.error" class="status-row"><dt>错误</dt><dd class="status-error">{{ store.ffmpeg.error }}</dd></div>
          </dl>
        </div>
      </section>

      <section class="panel">
        <h2 class="panel-title">FFmpeg / FFprobe 路径</h2>
        <p class="panel-note">路径留空时使用应用内置的 FFmpeg。</p>
        <div class="field">
          <label class="field-label">FFmpeg 路径</label>
          <div class="path-row">
            <input v-model="ffmpegPath" class="input mono" type="text" placeholder="留空使用内置 FFmpeg" />
            <button class="btn btn-ghost btn-sm" @click="browse('ffmpeg')">浏览</button>
          </div>
        </div>
        <div class="field">
          <label class="field-label">FFprobe 路径</label>
          <div class="path-row">
            <input v-model="ffprobePath" class="input mono" type="text" placeholder="留空使用内置 FFprobe" />
            <button class="btn btn-ghost btn-sm" @click="browse('ffprobe')">浏览</button>
          </div>
        </div>
        <button class="btn btn-primary" @click="savePaths">保存</button>
      </section>

      <section class="panel">
        <h2 class="panel-title">默认设置</h2>
        <div class="field">
          <label class="field-label">默认输出目录</label>
          <div class="dir-row">
            <span class="dir-path" :title="outputDir">{{ outputDir || '未设置' }}</span>
            <button class="btn btn-ghost btn-sm" @click="pickDir">选择目录</button>
          </div>
        </div>
        <div class="field">
          <label class="field-label">默认输出格式</label>
          <select v-model="format" class="select">
            <option value="mp4">{{ FORMAT_LABELS.mp4 }}</option>
            <option value="mkv">{{ FORMAT_LABELS.mkv }}</option>
            <option value="webm">{{ FORMAT_LABELS.webm }}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">默认质量预设</label>
          <select v-model="preset" class="select">
            <option value="compatibility">{{ PRESET_LABELS.compatibility }}</option>
            <option value="high-quality">{{ PRESET_LABELS['high-quality'] }}</option>
            <option value="small-size">{{ PRESET_LABELS['small-size'] }}</option>
          </select>
        </div>
      </section>
    </div>

    <input ref="fileInput" type="file" class="hidden-input" @change="onFileChosen" />
  </div>
</template>
