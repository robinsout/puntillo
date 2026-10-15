<script setup lang="ts">
import { computed, inject, onMounted, ref, shallowRef, useTemplateRef, watchEffect } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { searchTopics } from '@/application/wiki'
import type { Locale } from '@/domain/language'
import { WIKI_TOPICS, type WikiTopic } from '@/domain/wiki'
import { wikiLibraryKey } from '@/presentation/dependencies'
import { usePreferencesStore } from '@/presentation/preferences'
import { UiLinkList, UiTextField } from '@/presentation/ui'
import { useSessionReturn } from './session-return'

const library = inject(wikiLibraryKey)
if (!library) throw new Error('Wiki library is not provided: provide it with wikiLibraryKey')

const { t, locale } = useI18n()
const preferences = usePreferencesStore()
const backTo = useSessionReturn()
const title = useTemplateRef('title')

const query = ref('')
const found = shallowRef<readonly WikiTopic[]>(WIKI_TOPICS)

// Only the answer to the latest query counts; until it arrives the previous list stays.
let latest = 0
watchEffect(() => {
  const request = ++latest
  const titles = Object.fromEntries(
    WIKI_TOPICS.map((topic) => [topic, t(`wiki.topic.${topic}`)]),
  ) as Record<WikiTopic, string>
  searchTopics(library, {
    query: query.value,
    locale: locale.value as Locale,
    naming: { noteNaming: preferences.noteNaming, seventhNote: preferences.seventhNote },
    titles,
  }).then((topics) => {
    if (request === latest) found.value = topics
  })
})

const topicLinks = computed(() =>
  found.value.map((topic) => ({ to: `/wiki/${topic}`, label: t(`wiki.topic.${topic}`) })),
)

onMounted(() => title.value?.focus())
</script>

<template>
  <main class="screen">
    <h1 ref="title" tabindex="-1">{{ t('wiki.title') }}</h1>
    <UiTextField v-model="query" :label="t('wiki.search')" type="search" />
    <UiLinkList v-if="topicLinks.length > 0" :items="topicLinks" />
    <p v-else role="status" class="nothing">{{ t('wiki.nothingFound') }}</p>
    <RouterLink v-if="backTo" to="/" class="nav-link">{{ t(backTo) }}</RouterLink>
    <I18nT keypath="wiki.samplesCredit" tag="p" class="credit" scope="global">
      <template #piano>
        <a href="https://archive.org/details/SalamanderGrandPianoV3">Salamander Grand Piano</a>
      </template>
      <template #license>
        <a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>
      </template>
    </I18nT>
  </main>
</template>

<style scoped>
.nothing {
  color: var(--color-text-soft);
}

.credit {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

/* Links inside a sentence keep the 44 px target of the other links; padding grows an inline box
   without spreading the lines apart, as an inline-flex box would. */
.credit a {
  padding-block: calc((var(--target-size) - 1em) / 2);
}
</style>
