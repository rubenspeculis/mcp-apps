<script setup lang="ts">
import { useCallTool, useTheme, useToolResult } from "@mcpapps/vue";
import { computed } from "vue";

// Types flow from the zod schemas via the ToolRegistry augmentation.
const data = useToolResult<"get_weather">();
const refresh = useCallTool("get_weather");
// biome-ignore lint/correctness/noUnusedVariables: used in template
const theme = useTheme();

// biome-ignore lint/correctness/noUnusedVariables: used in template
const peak = computed(() => Math.max(1, ...(data.value?.hourly.map((h) => h.tempC) ?? [1])));

// biome-ignore lint/correctness/noUnusedVariables: used in template
async function reload() {
  if (data.value) await refresh({ city: "London" });
}
</script>

<template>
  <div class="card" :class="theme.colorScheme">
    <template v-if="data">
      <div class="head">
        <div>
          <div class="temp">{{ Math.round(data.tempC) }}°</div>
          <div class="cond">{{ data.condition }}</div>
        </div>
        <button @click="reload">Refresh</button>
      </div>
      <div class="bars">
        <div v-for="h in data.hourly" :key="h.hour" class="bar">
          <div class="fill" :style="{ height: `${(h.tempC / peak) * 100}%` }" />
          <span class="hour">{{ h.hour }}h</span>
        </div>
      </div>
    </template>
    <p v-else class="empty">Waiting for weather…</p>
  </div>
</template>

<style scoped>
.card {
  font: 14px/1.4 system-ui, sans-serif;
  padding: 20px;
  border-radius: 16px;
  background: #f6f7fb;
  color: #11131a;
  max-width: 420px;
}
.card.dark {
  background: #1a1d29;
  color: #eef0f7;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.temp {
  font-size: 44px;
  font-weight: 700;
  line-height: 1;
}
.cond {
  opacity: 0.7;
  margin-top: 4px;
}
button {
  font: inherit;
  border: none;
  border-radius: 999px;
  padding: 8px 14px;
  background: #4f46e5;
  color: #fff;
  cursor: pointer;
}
.bars {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  height: 110px;
  margin-top: 18px;
}
.bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
}
.fill {
  width: 100%;
  border-radius: 6px 6px 0 0;
  background: linear-gradient(#6366f1, #a855f7);
  min-height: 4px;
}
.hour {
  font-size: 11px;
  opacity: 0.6;
  margin-top: 6px;
}
.empty {
  opacity: 0.6;
}
</style>
