<script setup lang="ts">
import { inject } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/i18n";
import { SettingsSection } from "@/features/settings";
import { OPTIONS_PANEL_SFX } from "./injectionKeys";

const router = useRouter();
const { t } = useI18n();
const sfx = inject(OPTIONS_PANEL_SFX)!;
</script>

<template>
  <div class="options-category-root">
  <SettingsSection class="nav-section">
    <h3>{{ t("settings.contentManagement") }}</h3>
    <button
      type="button"
      class="nav-item"
      @click="sfx.playControlClickSfx(); router.push('/song-packs')"
    >
      <span class="nav-icon">&#x1F3B5;</span>
      <div class="nav-info">
        <span class="nav-title">{{ t("settings.manageSongPacks") }}</span>
        <span class="nav-desc">{{ t("settings.manageSongPacksDesc") }}</span>
      </div>
      <span class="nav-arrow">&rsaquo;</span>
    </button>
  </SettingsSection>
  </div>
</template>
