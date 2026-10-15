<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
  watchEffect,
} from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import type { Locale } from '@/domain/language'
import { isWikiTopic, type WikiArticle } from '@/domain/wiki'
import { StaffView } from '@/infrastructure/notation'
import { wikiLibraryKey } from '@/presentation/dependencies'
import { usePreferencesStore } from '@/presentation/preferences'
import { StaffSurface, useSessionStore } from '@/presentation/session'
import { UiButton, UiIcon, UiLinkList } from '@/presentation/ui'
import { useSessionReturn } from './session-return'

const props = defineProps<{ topic: string }>()

const library = inject(wikiLibraryKey)
if (!library) throw new Error('Wiki library is not provided: provide it with wikiLibraryKey')

const { t, locale } = useI18n()
const router = useRouter()
const preferences = usePreferencesStore()
const session = useSessionStore()
const title = useTemplateRef('title')
const backTo = useSessionReturn()

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
// A related article opens in this same view, so its heading takes the focus as a new screen does.
watch(
  () => props.topic,
  async () => {
    await nextTick()
    title.value?.focus()
  },
)

const relatedLinks = computed(() =>
  loading.value.kind === 'loaded'
    ? loading.value.article.related.map((related) => ({
        to: `/wiki/${related}`,
        label: t(`wiki.topic.${related}`),
      }))
    : [],
)

async function practice(article: WikiArticle) {
  session.start('unlimited', article.practice)
  await router.push('/')
}
</script>

<template>
  <main class="screen">
    <!-- One element in every state: a way back shown while loading stays the same once loaded. -->
    <div class="ways-back">
      <RouterLink to="/wiki" class="nav-link way-back">
        <UiIcon name="back" />{{ t('wiki.title') }}
      </RouterLink>
      <RouterLink v-if="backTo" to="/" class="nav-link way-back">
        <UiIcon name="back" />{{ t(backTo) }}
      </RouterLink>
    </div>
    <h1 v-if="!isWikiTopic(topic)" ref="title" tabindex="-1">{{ t('wiki.notFound') }}</h1>
    <template v-else>
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
          <StaffSurface v-else>
            <StaffView :question="block.question" :label="block.label" />
          </StaffSurface>
        </template>
        <UiButton
          v-if="!backTo"
          variant="primary"
          size="l"
          class="practice"
          @click="practice(loading.article)"
        >
          {{ t('wiki.practice') }}
        </UiButton>
        <template v-if="relatedLinks.length > 0">
          <h2>{{ t('wiki.seeAlso') }}</h2>
          <UiLinkList :items="relatedLinks" />
        </template>
      </template>
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

.ways-back {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--space-m);
}

.way-back {
  gap: var(--space-xs);
  color: var(--color-text-soft);
  text-decoration: none;
}

.way-back:hover {
  color: var(--color-text);
}

.practice {
  align-self: flex-start;
}

/* On a phone the main action takes the whole column, as at the foot of the trainer. */
@media (width < 768px) {
  .practice {
    align-self: stretch;
  }
}

h2 {
  margin: 0;
}
</style>
