<script setup lang="ts">
import { inject, onMounted, ref, shallowRef, useId, useTemplateRef, watchEffect } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { searchTopics } from '@/application/wiki'
import type { Locale } from '@/domain/language'
import { WIKI_TOPICS, type WikiTopic } from '@/domain/wiki'
import { wikiLibraryKey } from '@/presentation/dependencies'
import { usePreferencesStore } from '@/presentation/preferences'
import { useSessionReturn } from './session-return'

const library = inject(wikiLibraryKey)
if (!library) throw new Error('Wiki library is not provided: provide it with wikiLibraryKey')

const { t, locale } = useI18n()
const preferences = usePreferencesStore()
const backTo = useSessionReturn()
const title = useTemplateRef('title')
const searchId = useId()

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

onMounted(() => title.value?.focus())
</script>

<template>
  <main class="screen">
    <h1 ref="title" tabindex="-1">{{ t('wiki.title') }}</h1>
    <div class="search">
      <label :for="searchId">{{ t('wiki.search') }}</label>
      <input :id="searchId" v-model="query" type="search" />
    </div>
    <ul v-if="found.length > 0" class="topics">
      <li v-for="topic in found" :key="topic">
        <RouterLink :to="`/wiki/${topic}`" class="nav-link">
          {{ t(`wiki.topic.${topic}`) }}
        </RouterLink>
      </li>
    </ul>
    <p v-else role="status">{{ t('wiki.nothingFound') }}</p>
    <RouterLink to="/" class="nav-link">{{ t(backTo ?? 'wiki.trainer') }}</RouterLink>
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
.search {
  display: flex;
  flex-direction: column;
}

.topics {
  margin: 0;
  padding: 0;
  list-style: none;
}
.credit {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

/* Links inside a sentence keep the 44 px target of the other links. */
.credit a {
  display: inline-flex;
  align-items: center;
  min-width: var(--target-size);
  min-height: var(--target-size);
}
</style>
