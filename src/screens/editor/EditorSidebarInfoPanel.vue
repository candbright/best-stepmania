<script setup lang="ts">
import { useI18n } from "@/i18n";
import { AppNumberField } from "@/shared/ui";

const { t } = useI18n();

defineProps<{
  metaSaving: boolean;
}>();

const metaTitle = defineModel<string>("metaTitle", { required: true });
const metaSubtitle = defineModel<string>("metaSubtitle", { required: true });
const metaArtist = defineModel<string>("metaArtist", { required: true });
const metaGenre = defineModel<string>("metaGenre", { required: true });
const metaMusic = defineModel<string>("metaMusic", { required: true });
const metaBanner = defineModel<string>("metaBanner", { required: true });
const metaBackground = defineModel<string>("metaBackground", { required: true });
const metaOffset = defineModel<number>("metaOffset", { required: true });
const metaSampleStart = defineModel<number>("metaSampleStart", { required: true });
const metaSampleLength = defineModel<number>("metaSampleLength", { required: true });

const emit = defineEmits<{
  saveMetadata: [];
  startOffsetEdit: [];
  offsetValueChanged: [];
  commitOffsetEdit: [];
  cancelOffsetEdit: [];
  startSampleStartEdit: [];
  sampleStartValueChanged: [];
  commitSampleStartEdit: [];
  cancelSampleStartEdit: [];
  startSampleLengthEdit: [];
  sampleLengthValueChanged: [];
  commitSampleLengthEdit: [];
  cancelSampleLengthEdit: [];
}>();
</script>

<template>
  <div class="sidebar-content">
    <h4 class="sidebar-section-head">{{ t('editor.metadata') }}</h4>
    <div class="meta-form">
      <label class="meta-field">
        <span>{{ t('editor.metaTitle') }}</span>
        <input v-model="metaTitle" type="text" />
      </label>
      <label class="meta-field">
        <span>{{ t('editor.metaSubtitle') }}</span>
        <input v-model="metaSubtitle" type="text" />
      </label>
      <label class="meta-field">
        <span>{{ t('editor.metaArtist') }}</span>
        <input v-model="metaArtist" type="text" />
      </label>
      <label class="meta-field">
        <span>{{ t('editor.metaGenre') }}</span>
        <input v-model="metaGenre" type="text" />
      </label>
      <label class="meta-field">
        <span>{{ t('editor.metaMusic') }}</span>
        <input v-model="metaMusic" type="text" :placeholder="t('editor.placeholderAudioFile')" />
      </label>
      <label class="meta-field">
        <span>{{ t('editor.metaBanner') }}</span>
        <input v-model="metaBanner" type="text" :placeholder="t('editor.placeholderBanner')" />
      </label>
      <label class="meta-field">
        <span>{{ t('editor.metaBackground') }}</span>
        <input v-model="metaBackground" type="text" :placeholder="t('editor.placeholderBackground')" />
      </label>
      <label class="meta-field">
        <span>{{ t('editor.metaOffset') }}</span>
        <AppNumberField
          v-model="metaOffset"
          data-editor-shortcuts="allow"
          inputmode="decimal"
          step="0.001"
          @step="emit('startOffsetEdit')"
          @focus="emit('startOffsetEdit')"
          @update:model-value="emit('offsetValueChanged')"
          @blur="emit('commitOffsetEdit')"
          @keydown.escape="emit('cancelOffsetEdit')"
        />
      </label>
      <label class="meta-field">
        <span>{{ t('editor.metaSampleStart') }}</span>
        <AppNumberField
          v-model="metaSampleStart"
          data-editor-shortcuts="allow"
          step="0.1"
          @step="emit('startSampleStartEdit')"
          @focus="emit('startSampleStartEdit')"
          @update:model-value="emit('sampleStartValueChanged')"
          @blur="emit('commitSampleStartEdit')"
          @keydown.escape="emit('cancelSampleStartEdit')"
        />
      </label>
      <label class="meta-field">
        <span>{{ t('editor.metaSampleLength') }}</span>
        <AppNumberField
          v-model="metaSampleLength"
          data-editor-shortcuts="allow"
          step="0.1"
          @step="emit('startSampleLengthEdit')"
          @focus="emit('startSampleLengthEdit')"
          @update:model-value="emit('sampleLengthValueChanged')"
          @blur="emit('commitSampleLengthEdit')"
          @keydown.escape="emit('cancelSampleLengthEdit')"
        />
      </label>
      <button type="button" class="tool-btn save-btn meta-save" @click="emit('saveMetadata')" :disabled="metaSaving">
        {{ t('editor.save') }}
      </button>
    </div>
  </div>
</template>
