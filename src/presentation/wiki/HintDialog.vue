<script setup lang="ts">
import { inject, ref, shallowRef, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Locale } from '@/domain/language'
import type { WikiHint, WikiTopic } from '@/domain/wiki'
import { StaffView } from '@/infrastructure/notation'
import { wikiLibraryKey } from '@/presentation/dependencies'
import { usePreferencesStore } from '@/presentation/preferences'
import StaffSurface from '@/presentation/session/StaffSurface.vue'
import { UiButton, UiDialog } from '@/presentation/ui'

const props = defineProps<{ topic: WikiTopic }>()
const emit = defineEmits<{ close: []; read: [] }>()

const library = inject(wikiLibraryKey)
if (!library) throw new Error('Wiki library is not provided: provide it with wikiLibraryKey')

const { t, locale } = useI18n()
const preferences = usePreferencesStore()
const open = ref(true)
const textId = useId()

type Loading =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'loaded'; readonly hint: WikiHint }

const loading = shallowRef<Loading>({ kind: 'loading' })
const staffFailed = ref(false)

// The dialog is mounted for one opening, so its topic, language and naming do not change.
library
  .load(props.topic, locale.value as Locale, {
    noteNaming: preferences.noteNaming,
    seventhNote: preferences.seventhNote,
  })
  .then(
    ({ hint }) => {
      loading.value = { kind: 'loaded', hint }
    },
    () => {
      loading.value = { kind: 'failed' }
    },
  )
</script>

<template>
  <UiDialog
    v-model:open="open"
    :title="t(`wiki.topic.${topic}`)"
    :aria-describedby="loading.kind === 'loaded' ? textId : undefined"
    @close="emit('close')"
  >
    <p v-if="loading.kind === 'loading'" role="status">{{ t('wiki.loading') }}</p>
    <p v-else-if="loading.kind === 'failed'" role="alert">{{ t('wiki.loadError') }}</p>
    <template v-else>
      <!-- The HTML is made from the Markdown of the articles, with raw HTML escaped. -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <p :id="textId" v-html="loading.hint.html" />
      <p v-if="staffFailed" role="alert">{{ t('trainer.staffLoadError') }}</p>
      <StaffSurface v-else>
        <StaffView
          :question="loading.hint.question"
          :label="loading.hint.label"
          single-line
          @load-error="staffFailed = true"
        />
      </StaffSurface>
    </template>
    <template #actions>
      <UiButton :to="`/wiki/${topic}`" class="read" @click="emit('read')">
        {{ t('wiki.readArticle') }}
      </UiButton>
      <UiButton @click="open = false">{{ t('wiki.close') }}</UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
p {
  margin: 0;
}

/* The way out to the article stands apart from Close. */
.read {
  margin-inline-end: auto;
}
</style>
