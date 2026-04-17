<script setup lang="ts">
import { useI18n } from "@/shared/i18n";
import { BaseConfirmModal } from "@/shared/ui";
import { BaseModal } from "@/shared/ui";
import { BaseSelect } from "@/shared/ui";
import { BaseNumberField } from "@/shared/ui";

defineOptions({ name: "EditorScreenChartModals" });

const { t } = useI18n();

const showDeleteChartModal = defineModel<boolean>("showDeleteChartModal", { required: true });
const showNewChartModal = defineModel<boolean>("showNewChartModal", { required: true });
const newChartStepsType = defineModel<string>("newChartStepsType", { required: true });
const newChartDifficulty = defineModel<string>("newChartDifficulty", { required: true });
const newChartMeter = defineModel<number>("newChartMeter", { required: true });

defineProps<{
  newChartModalStepsOptions: Array<{ value: string; label: string }>;
  newChartModalDifficultyOptions: Array<{ value: string; label: string }>;
}>();

const emit = defineEmits<{
  confirmDelete: [];
  createNewChart: [];
}>();
</script>

<template>
  <BaseConfirmModal
    v-model="showDeleteChartModal"
    :title="t('editor.deleteChartModalTitle')"
    :step1-message="t('editor.confirmDeleteStep1')"
    :step2-message="t('editor.confirmDeleteStep2')"
    :continue-label="t('continue')"
    :cancel-label="t('cancel')"
    :back-label="t('stepBack')"
    :confirm-label="t('editor.confirmDeleteAction')"
    @confirm="emit('confirmDelete')"
  />

  <BaseModal
    v-model="showNewChartModal"
    :title="t('editor.newChart')"
    width="min(400px, 92vw)"
  >
    <div class="form-modal-fields">
      <label class="form-modal-label">{{ t('editor.stepsType') }}</label>
      <BaseSelect v-model="newChartStepsType" variant="form" :options="newChartModalStepsOptions" />
      <label class="form-modal-label">{{ t('editor.difficulty') }}</label>
      <BaseSelect v-model="newChartDifficulty" variant="form" :options="newChartModalDifficultyOptions" />
      <label class="form-modal-label">{{ t('editor.meter') }}</label>
      <BaseNumberField v-model="newChartMeter" input-class="form-modal-input" :min="1" :max="99" />
    </div>
    <template #footer>
      <div class="form-modal-footer-inner">
        <button type="button" class="form-modal-btn" @click="showNewChartModal = false">{{ t('cancel') }}</button>
        <button type="button" class="form-modal-btn form-modal-btn--primary" @click="emit('createNewChart')">
          {{ t('confirm') }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>
