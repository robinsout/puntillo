<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from './preferences-store'

const { t } = useI18n()
const preferences = usePreferencesStore()
</script>

<template>
  <!-- Always there, so a screen reader hears the notice when it fills on a failed save. -->
  <p role="status" class="notice">{{ preferences.canSave ? '' : t('preferences.notSaved') }}</p>
</template>

<style scoped>
.notice {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
