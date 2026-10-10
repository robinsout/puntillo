<script setup lang="ts">
import { inject, onMounted, shallowRef, useTemplateRef, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import type { Locale } from '@/domain/language'
import { isWikiTopic, type WikiArticle } from '@/domain/wiki'
import { StaffView } from '@/infrastructure/notation'
import { wikiLibraryKey } from '@/presentation/dependencies'
import { usePreferencesStore } from '@/presentation/preferences'
import { useSessionStore } from '@/presentation/session'

const props = defineProps<{ topic: string }>()

const library = inject(wikiLibraryKey)
if (!library) throw new Error('Wiki library is not provided: provide it with wikiLibraryKey')

const { t, locale } = useI18n()
const router = useRouter()
const preferences = usePreferencesStore()
const session = useSessionStore()
const title = useTemplateRef('title')

type Loading =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'loaded'; readonly article: WikiArticle }

const loading = shallowRef<Loading>({ kind: 'loading' })

// Only the answer to the latest request counts: an earlier one may arrive after it.
let latest = 0
watchEffect(() => {
  const { topic } = props
  if (!isWikiTopic(topic)) return
  const request = ++latest
  const naming = { noteNaming: preferences.noteNaming, seventhNote: preferences.seventhNote }
  loading.value = { kind: 'loading' }
  library.load(topic, locale.value as Locale, naming).then(
    (article) => {
      if (request === latest) loading.value = { kind: 'loaded', article }
    },
    () => {
      if (request === latest) loading.value = { kind: 'failed' }
    },
  )
})

onMounted(() => title.value?.focus())

async function practice(article: WikiArticle) {
  session.start('unlimited', article.practice)
  await router.push('/')
}
</script>

<template>
  <main v-if="!isWikiTopic(topic)" class="screen">
    <h1 ref="title" tabindex="-1">{{ t('wiki.notFound') }}</h1>
    <RouterLink to="/wiki" class="nav-link">{{ t('wiki.title') }}</RouterLink>
  </main>
  <main v-else class="screen">
    <h1 ref="title" tabindex="-1">{{ t(`wiki.topic.${topic}`) }}</h1>
    <p v-if="loading.kind === 'loading'" role="status">{{ t('wiki.loading') }}</p>
    <template v-else-if="loading.kind === 'failed'">
      <p role="alert">{{ t('wiki.loadError') }}</p>
      <RouterLink to="/wiki" class="nav-link">{{ t('wiki.back') }}</RouterLink>
    </template>
    <template v-else>
      <template v-for="(block, index) in loading.article.blocks" :key="index">
        <!-- The HTML is made from the Markdown of the articles, with raw HTML escaped. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="block.kind === 'text'" class="text" v-html="block.html" />
        <StaffView v-else :question="block.question" :label="block.label" />
      </template>
      <button type="button" class="primary" @click="practice(loading.article)">
        {{ t('wiki.practice') }}
      </button>
      <RouterLink to="/wiki" class="nav-link">{{ t('wiki.title') }}</RouterLink>
    </template>
  </main>
</template>

<style scoped>
.text {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}

.text > :deep(*) {
  margin: 0;
}

.primary {
  align-self: flex-start;
}
</style>
