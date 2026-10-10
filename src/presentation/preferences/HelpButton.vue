<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ parameter: string }>()
const emit = defineEmits<{ open: [button: HTMLButtonElement] }>()

const { t } = useI18n()
</script>

<template>
  <button
    type="button"
    class="help"
    :aria-label="t('wiki.help', { parameter })"
    @click="emit('open', $event.currentTarget as HTMLButtonElement)"
  >
    ?
  </button>
</template>

<style scoped>
.help {
  flex: none;
  padding-inline: 0;
  border-radius: 50%;
  font-weight: 700;
}
</style>
