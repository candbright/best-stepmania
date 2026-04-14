<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "@/i18n";
import BaseModal from "@/components/BaseModal.vue";

const props = defineProps<{ helpKey: string }>();
const { t } = useI18n();
const open = ref(false);

function toggle() {
  open.value = !open.value;
}

function helpPrefixedKey(): string {
  return "help." + props.helpKey;
}

/** 首行为短标题、其余为正文；无换行时与旧行为兼容（整段为正文，标题截断） */
function splitHelpText(raw: string): { title: string; body: string } {
  const trimmed = raw.trim();
  const nl = trimmed.indexOf("\n");
  if (nl === -1) {
    const line = trimmed;
    const title =
      line.length > 56 ? line.slice(0, 53) + "…" : line;
    return { title, body: trimmed };
  }
  const title = trimmed.slice(0, nl).trim();
  const body = trimmed.slice(nl + 1).trim();
  if (body.length === 0) {
    const tline = title.length > 56 ? title.slice(0, 53) + "…" : title;
    return { title: tline, body: trimmed };
  }
  const safeTitle = title.length > 56 ? title.slice(0, 53) + "…" : title;
  return { title: safeTitle, body };
}

function helpParts(): { title: string; body: string } {
  const k = helpPrefixedKey();
  const v = t(k);
  if (v === k) {
    return { title: t("help.topicFallback"), body: t("help.none") };
  }
  return splitHelpText(v);
}

function helpTooltipTitle(): string {
  const k = helpPrefixedKey();
  const v = t(k);
  if (v === k) return t("help.topicFallback");
  return splitHelpText(v).title;
}

function helpBody(): string {
  return helpParts().body;
}

function helpDialogTitle(): string {
  return helpParts().title;
}
</script>

<template>
  <span class="help-wrapper">
    <button class="help-btn" @click.stop="toggle" :title="helpTooltipTitle()">?</button>
    <BaseModal v-model="open" :title="helpDialogTitle()" :width="'min(500px, 90vw)'">
      <div class="help-body">{{ helpBody() }}</div>
    </BaseModal>
  </span>
</template>

<style scoped>
.help-wrapper { display: inline-flex; align-items: center; }
.help-btn {
  width: 1.25rem; height: 1.25rem; border-radius: 50%;
  background: color-mix(in srgb, var(--primary-color) 15%, transparent); border: 1px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
  color: color-mix(in srgb, var(--primary-color) 80%, var(--text-color)); font-size: 0.7rem; font-weight: 800;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; margin-left: 0.375rem; flex-shrink: 0;
}
.help-btn:hover { background: color-mix(in srgb, var(--primary-color) 30%, transparent); color: var(--text-color); }

.help-body {
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--text-muted);
  white-space: pre-line;
}
</style>
