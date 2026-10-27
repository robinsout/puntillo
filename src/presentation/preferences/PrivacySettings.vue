<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCounterOptOut } from '@/presentation/dependencies'
import { UiCheckbox, UiSection } from '@/presentation/ui'

const { t } = useI18n()
const optOut = useCounterOptOut()
const off = ref(optOut.isOff())
const canSave = optOut.canSave()
const noteId = useId()
const notSavedId = useId()
const describedBy = computed(() => (canSave ? noteId : `${noteId} ${notSavedId}`))

function chooseOff(value: boolean) {
  optOut.setOff(value)
  off.value = optOut.isOff()
}
</script>

<template>
  <UiSection :title="t('settings.privacy')">
    <UiCheckbox
      :model-value="off"
      @update:model-value="chooseOff"
      :disabled="!canSave"
      :aria-describedby="describedBy"
      >{{ t('settings.dontCountVisits') }}</UiCheckbox
    >
    <p :id="noteId" class="notice">{{ t('settings.countingNote') }}</p>
    <p v-if="!canSave" :id="notSavedId" class="notice">{{ t('settings.choiceNotSaved') }}</p>
    <p class="notice">{{ t('settings.microphoneNote') }}</p>
  </UiSection>
</template>

<style scoped>
.notice {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
