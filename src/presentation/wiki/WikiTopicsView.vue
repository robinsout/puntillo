<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { WIKI_TOPICS } from '@/domain/wiki'

const { t } = useI18n()
const title = useTemplateRef('title')

onMounted(() => title.value?.focus())
</script>

<template>
  <main class="screen">
    <h1 ref="title" tabindex="-1">{{ t('wiki.title') }}</h1>
    <ul class="topics">
      <li v-for="topic in WIKI_TOPICS" :key="topic">
        <RouterLink :to="`/wiki/${topic}`" class="nav-link">
          {{ t(`wiki.topic.${topic}`) }}
        </RouterLink>
      </li>
    </ul>
    <RouterLink to="/" class="nav-link">{{ t('wiki.trainer') }}</RouterLink>
  </main>
</template>

<style scoped>
.topics {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
