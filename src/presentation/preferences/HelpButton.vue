<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { UiIconButton } from '@/presentation/ui'

defineProps<{ parameter: string }>()
const emit = defineEmits<{ open: [button: HTMLButtonElement] }>()

const { t } = useI18n()
</script>

<template>
  <UiIconButton
    :label="t('wiki.help', { parameter })"
    @click="emit('open', $event.currentTarget as HTMLButtonElement)"
  >
    ?
  </UiIconButton>
</template>
