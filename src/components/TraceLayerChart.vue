<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ rows: Record<string, unknown>[]; valueKey: string; label: string }>()
const plot = computed(() => {
  const points = props.rows.flatMap(row => typeof row.layer_index === 'number' && typeof row[props.valueKey] === 'number' && Number.isFinite(row[props.valueKey]) ? [{ layer: row.layer_index, value: row[props.valueKey] as number }] : []).sort((a, b) => a.layer - b.layer)
  if (!points.length) return null
  const min = Math.min(...points.map(point => point.value)); const max = Math.max(...points.map(point => point.value))
  const first = points[0]!.layer; const last = points.at(-1)!.layer
  const x = (layer: number) => 65 + (layer - first) / (last - first || 1) * 510
  const y = (value: number) => min === max ? 88 : 150 - (value - min) / (max - min) * 125
  return { min, max, first, last, points: points.map(point => `${x(point.layer)},${y(point.value)}`).join(' '), zero: min < 0 && max > 0 ? y(0) : null }
})
</script>
<template>
  <figure class="trace-chart"><figcaption>{{ label }}</figcaption>
    <svg v-if="plot" viewBox="0 0 600 185" role="img" :aria-label="`${label}，层索引 ${plot.first} 至 ${plot.last}，值 ${plot.min} 至 ${plot.max}`">
      <path d="M65 20 V150 H575" fill="none" stroke="#ccd6df" />
      <line v-if="plot.zero != null" x1="65" x2="575" :y1="plot.zero" :y2="plot.zero" stroke="#ccd6df" stroke-dasharray="4" />
      <polyline :points="plot.points" fill="none" stroke="#27899a" stroke-width="2" />
      <text x="58" y="28" text-anchor="end">{{ Number(plot.max.toPrecision(4)) }}</text><text x="58" y="153" text-anchor="end">{{ Number(plot.min.toPrecision(4)) }}</text>
      <text x="65" y="173">{{ plot.first }}</text><text x="575" y="173" text-anchor="end">{{ plot.last }} 层</text>
    </svg><p v-else class="muted">暂无层指标</p>
  </figure>
</template>
<style scoped>
.trace-chart { margin: 16px 0; min-width: 0; }
figcaption { color: #44566c; font-size: 13px; }
svg { display: block; width: 100%; max-height: 240px; }
text { fill: #718096; font-size: 11px; }
</style>
