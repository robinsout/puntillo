<script setup lang="ts">
import { inject, onMounted, ref, shallowRef, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import type { Locale } from '@/domain/language'
import type { WikiHint, WikiTopic } from '@/domain/wiki'
import { StaffView } from '@/infrastructure/notation'
import { wikiLibraryKey } from '@/presentation/dependencies'
import { usePreferencesStore } from '@/presentation/preferences'

const props = defineProps<{ topic: WikiTopic }>()
const emit = defineEmits<{ close: []; read: [] }>()

const library = inject(wikiLibraryKey)
if (!library) throw new Error('Wiki library is not provided: provide it with wikiLibraryKey')

const { t, locale } = useI18n()
const preferences = usePreferencesStore()
const dialog = useTemplateRef('dialog')
const titleId = useId()
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

onMounted(() => dialog.value?.showModal())

// The content fills the dialog box, so only a press on the backdrop targets the dialog itself.
function onClick(event: MouseEvent) {
  if (event.target === dialog.value) dialog.value?.close()
}
</script>

<template>
  <dialog
    ref="dialog"
    class="hint"
    :aria-labelledby="titleId"
    :aria-describedby="loading.kind === 'loaded' ? textId : undefined"
    @close="emit('close')"
    @click="onClick"
  >
    <div class="content">
      <h2 :id="titleId">{{ t(`wiki.topic.${topic}`) }}</h2>
      <p v-if="loading.kind === 'loading'" role="status">{{ t('wiki.loading') }}</p>
      <p v-else-if="loading.kind === 'failed'" role="alert">{{ t('wiki.loadError') }}</p>
      <template v-else>
        <!-- The HTML is made from the Markdown of the articles, with raw HTML escaped. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <p :id="textId" v-html="loading.hint.html" />
        <p v-if="staffFailed" role="alert">{{ t('trainer.staffLoadError') }}</p>
        <StaffView
          v-else
          :question="loading.hint.question"
          :label="loading.hint.label"
          single-line
          @load-error="staffFailed = true"
        />
      </template>
      <div class="actions">
        <RouterLink :to="`/wiki/${topic}`" class="nav-link" @click="emit('read')">
          {{ t('wiki.readArticle') }}
        </RouterLink>
        <button type="button" @click="dialog?.close()">{{ t('wiki.close') }}</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.hint {
  box-sizing: border-box;
  width: min(32rem, 100% - 2 * var(--space-m));
  max-width: none;
  padding: 0;
  border: none;
  border-radius: var(--radius);
  color: var(--color-text);
  background: var(--color-surface);
}

.hint::backdrop {
  background: rgb(0 0 0 / 0.4);
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  padding: var(--space-m);
}

.content > h2,
.content > p {
  margin: 0;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-s);
}
</style>
