# Справочник нотации: решения и источники

Сюда записываются правила нотной записи, на которые опирается тренажёр, с источниками. Файл
служит основой для статей вики (ТЗ 10): каждое правило здесь — кандидат в подсказку или раздел
статьи. Правило добавляется, когда решение о нотации принимается в фиче; в «Решениях по ходу
работы» фичи ставится ссылка сюда.

## Длительности

**Названия и доли.** Длительность записывается как доля целой ноты: целая 1/1, половинная 1/2,
четвертная 1/4, восьмая 1/8, шестнадцатая 1/16. В немецкой и русской традиции названия сами
являются дробями (Viertel — четверть). Встречается и запись «целая = 1», но 1/1 последовательнее.

- Где применено: кнопки длительностей (фича duration-fractions).
- Тема вики: «Длительности нот и пауз».
- Источники:
  - [Note value — Simple Wikipedia](https://simple.wikipedia.com/wiki/Note_value)
  - [Note values — Vaia](https://vaia.com/en-us/explanations/music/music-theory/note-values)
  - [Musiklehre: Die Notenwerte — Wikibooks](https://de.wikibooks.org/wiki/Musiklehre:_Die_Notenwerte)
  - [Die Notenwerte — schule-bw.de](https://www.schule-bw.de/resolveuid/c11fa05f4fde4d85a00a9c3fd83b2e3e)
  - [Notenwerte lernen — delamar.de](https://www.delamar.de/musiktheorie/notenwerte-lernen-69995/)
  - [Длительности нот — infourok.ru](https://infourok.ru/dlitelnosti-not-v-muzyke-8085524.html)

**Точка.** Точка удлиняет длительность наполовину: четверть с точкой = 1/4 + 1/8 = 3/8.

- Где применено: кнопка «Dot» (фича multi-note-questions, срез 5).
- Тема вики: «Длительности нот и пауз».

## Штили

**Направление штиля.** Ноты ниже средней линии нотоносца пишутся со штилем вверх, ноты на
средней линии (в скрипичном ключе — B4) и выше — со штилем вниз.

- Где применено: нотоносец, `autoStem` VexFlow (фича difficulty-presets, срез 2).
- Тема вики: «Длительности нот и пауз» (как выглядит нота).
- Источник: Elaine Gould, «Behind Bars», раздел о штилях.

## Альтерации

**Длительность действия случайного знака.** Знак действует на ноту той же высоты в той же
октаве до конца такта, пока его не отменит другой знак. Тактовая черта отменяет знак.

**Напоминательный знак.** Чтобы отмена знака тактовой чертой была однозначной, перед первой
нотой того же названия в следующем такте принято ставить напоминательный знак. Его же ставят
перед нотой того же названия в другой октаве того же такта. Скобки у напоминательного знака —
по традиции издателя, общего правила нет.

- Где применено: фича accidentals, срез 2.
- Тема вики: «Диез, бемоль, бекар».
- Источники:
  - Elaine Gould, «Behind Bars», глава об альтерациях (с. 78–79 — знак в другой октаве)
  - [Accidental (music) — Wikipedia](<https://en.wikipedia.org/wiki/Accidental_(music)>)
  - [Common practice accidental duration rule — Dorico](https://steinberg.help/dorico/v2/en/dorico/topics/notation_reference/notation_reference_accidentals_common_practice_r.html)
  - [Accidental duration rules — Dorico](https://steinberg.help/dorico/v4/en/dorico/topics/notation_reference/notation_reference_accidentals/notation_reference_accidentals_duration_rules_r.html)
  - [Using accidentals with octaves — MuseScore](https://musescore.org/en/node/249431)
  - [What is a cautionary accidental? — MEI-L](https://lists.uni-paderborn.de/pipermail/mei-l/2016/001783.html)

**Запись важнее звучания.** До-диез и ре-бемоль звучат одинаково, но записываются на разных
местах нотоносца; в тренажёре засчитывается только точная запись (ТЗ 7.1).

- Тема вики: «Диез, бемоль, бекар».
