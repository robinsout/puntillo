<script setup lang="ts">
import {
  computed,
  inject,
  onMounted,
  ref,
  shallowRef,
  useId,
  useTemplateRef,
  watchEffect,
} from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { searchTopics } from '@/application/wiki'
import type { Locale } from '@/domain/language'
import { WIKI_TOPICS, type WikiTopic } from '@/domain/wiki'
import { wikiLibraryKey } from '@/presentation/dependencies'
import { usePreferencesStore } from '@/presentation/preferences'
import { useSessionStore } from '@/presentation/session'

const library = inject(wikiLibraryKey)
if (!library) throw new Error('Wiki library is not provided: provide it with wikiLibraryKey')

const { t, locale } = useI18n()
const preferences = usePreferencesStore()
const session = useSessionStore()
const onQuestion = computed(() => session.state.phase === 'question')
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
    <RouterLink to="/" class="nav-link">
      {{ onQuestion ? t('wiki.backToQuestion') : t('wiki.trainer') }}
    </RouterLink>
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
</style>
