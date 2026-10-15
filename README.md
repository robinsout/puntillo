# Puntillo

[![CI](https://github.com/robinsout/puntillo/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/robinsout/puntillo/actions/workflows/ci.yml)
[![Сайт](https://img.shields.io/website?url=https%3A%2F%2Frobinsout.github.io%2Fpuntillo%2F&label=site)](https://robinsout.github.io/puntillo/)
[![Покрытие домена](https://img.shields.io/badge/domain%20coverage-100%25-brightgreen)](vitest.config.ts)
[![Последний коммит](https://img.shields.io/github/last-commit/robinsout/puntillo)](https://github.com/robinsout/puntillo/commits/master)
[![Лицензия](https://img.shields.io/github/license/robinsout/puntillo)](LICENSE)

[![Lighthouse: производительность](https://img.shields.io/endpoint?url=https%3A%2F%2Frobinsout.github.io%2Fpuntillo%2Fbadges%2Fperformance.json&logo=lighthouse)](https://robinsout.github.io/puntillo/lighthouse/)
[![Lighthouse: доступность](https://img.shields.io/endpoint?url=https%3A%2F%2Frobinsout.github.io%2Fpuntillo%2Fbadges%2Faccessibility.json&logo=lighthouse)](https://robinsout.github.io/puntillo/lighthouse/)
[![Lighthouse: рекомендации](https://img.shields.io/endpoint?url=https%3A%2F%2Frobinsout.github.io%2Fpuntillo%2Fbadges%2Fbest-practices.json&logo=lighthouse)](https://robinsout.github.io/puntillo/lighthouse/)
[![Lighthouse: SEO](https://img.shields.io/endpoint?url=https%3A%2F%2Frobinsout.github.io%2Fpuntillo%2Fbadges%2Fseo.json&logo=lighthouse)](https://robinsout.github.io/puntillo/lighthouse/)
[![Lighthouse: время до взаимодействия](https://img.shields.io/endpoint?url=https%3A%2F%2Frobinsout.github.io%2Fpuntillo%2Fbadges%2Finteractive.json&logo=lighthouse)](https://robinsout.github.io/puntillo/lighthouse/)

Веб-тренажёр чтения нот с листа для начинающих и для тех, кто играет по слуху и хочет научиться
читать ноты. Короткие сессии по 3–15 минут, с телефона или с компьютера.

**Открыть: https://robinsout.github.io/puntillo/**

<p>
  <img src="docs/images/start-phone.png" alt="Стартовый экран на телефоне: упражнение, уровень, длина сессии" width="260">
  <img src="docs/images/review-desktop.png" alt="Разбор ошибки на десктопе: верная нота и ответ на нотоносце, объяснение" width="560">
</p>

## Что умеет

- **Читать ноты**: на нотоносце нота или такт, ответ — название ноты или клавиша фортепиано
  (экранная, клавиатура компьютера или MIDI-инструмент) и длительность.
- **Записывать ноты**: по названию поставить ноту на нотоносец, со знаками и длительностью.
- **Разбор ошибок**: вторая попытка, верный ответ и ваш на нотоносце, объяснение и подсказка
  справки, повтор ошибочных нот в той же сессии.
- **Уровни и тонкая настройка**: три пресета и ручная настройка диапазона, добавочных линеек,
  длительностей, размеров, пауз, точек, ключевых знаков и альтераций с живым примером.
- **Справка**: статьи о нотах на скрипичном ключе, длительностях, знаках, тональностях и
  клавиатуре, с нотными примерами и кнопкой «Потренировать это».
- **Прогресс**: история за 30 дней, трудные ноты, незавершённая сессия продолжается после
  перезагрузки, экспорт и импорт файлом. Всё хранится в браузере.
- **Три языка интерфейса** (русский, английский, испанский) и независимые системы названий нот.

## Как сделано

Vue 3, TypeScript strict, Pinia, Vue Router, Vue I18n, VexFlow для нотации, Web Audio для звука,
Vitest и Playwright для тестов. Четыре слоя с зависимостями внутрь
(`presentation → application → domain ← infrastructure`), домен покрыт тестами полностью.
Оформление — дизайн-система «Нотная бумага» на токенах. Каждая фича начинается с утверждённых
критериев приёмки и делается тонкими срезами по TDD.

- Техническое задание: [`docs/spec.md`](docs/spec.md)
- Критерии приёмки фич: [`docs/features/`](docs/features/)
- Дизайн-система: [`docs/design-system.md`](docs/design-system.md), живой каталог —
  `/design-system` в дев-сервере
- Правила работы над проектом: [`CLAUDE.md`](CLAUDE.md)

## Требования

Node.js версии из `.nvmrc` (24.18.0). Если версия в системе ниже:

```sh
nvm use
```

## Установка

```sh
npm install
```

## Команды

| Команда                   | Назначение                                                      |
| ------------------------- | --------------------------------------------------------------- |
| `npm run dev`             | Дев-сервер на http://localhost:5173                             |
| `npm run build`           | Рабочая сборка с проверкой типов                                |
| `npm run preview`         | Просмотр собранной версии                                       |
| `npm run type-check`      | Проверка типов                                                  |
| `npm run lint`            | Линтеры (oxlint, ESLint, Stylelint) с автоисправлением          |
| `npm run lint:check`      | Линтеры без изменений файлов                                    |
| `npm run format`          | Форматирование                                                  |
| `npm run format:check`    | Проверка форматирования                                         |
| `npm run test:unit`       | Модульные и компонентные тесты в режиме наблюдения              |
| `npm run test:unit:run`   | То же однократно                                                |
| `npm run test:coverage`   | Тесты с покрытием, домен обязан быть покрыт полностью           |
| `npm run test:e2e`        | Сквозные тесты Playwright                                       |
| `npm run render:examples` | Перерисовать примеры уровней на стартовом экране                |
| `npm test`                | Полная проверка: типы, линтеры, форматирование, модульные тесты |

## Структура

```
src/
  domain/          музыкальные правила, сущности, именование, оценка. Чистый TypeScript
  application/     сценарии: сессия, генерация вопроса, проверка, очередь повторов, прогресс
  infrastructure/  хранилище, i18n, рендер нотации, звук, MIDI, справка
  presentation/    экраны и сторы; ui/ — дизайн-система, shell/ — шапка и навигация
e2e/               сквозные тесты
scripts/           генерация примеров уровней, значки Lighthouse
docs/              техническое задание, критерии приёмки фич, дизайн-система
```

Направление зависимостей проверяется правилом `no-restricted-imports` в `eslint.config.ts`,
значения стилей мимо токенов — Stylelint.

## CI и публикация

На каждый пул-реквест и пуш в `master` (`.github/workflows/ci.yml`): линтеры, форматирование,
типы, модульные тесты с покрытием, сборка, сквозные тесты в Chromium, Firefox, WebKit, Mobile
Chrome и Mobile Safari. После зелёных проверок на `master` сборка уходит на GitHub Pages.

Перед публикацией Lighthouse с мобильным профилем проверяет собранную версию: оценки становятся
значками выше, полный отчёт — https://robinsout.github.io/puntillo/lighthouse/. Если время до
первого взаимодействия больше 3 с (ТЗ §18), публикация останавливается.

## Лицензия

[MIT](LICENSE). Звук фортепиано — Salamander Grand Piano, Alexander Holm, CC BY 3.0.
