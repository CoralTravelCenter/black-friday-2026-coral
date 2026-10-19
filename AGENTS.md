# AGENTS.md

Этот файл содержит правила, специфичные для текущего репозитория.

Глобальные инженерные правила наследуются из `~/.codex/AGENTS.md`.

Не дублируй здесь глобальные правила. Этот файл должен оставаться коротким и содержать только информацию, которая помогает безопасно работать именно с текущим проектом.

---

# Project discovery

В начале новой задачи сначала определи фактическую структуру проекта из репозитория.

Проверь только то, что необходимо:

- package/config files;
- основные source directories;
- доступные scripts;
- существующие tests;
- локальные `AGENTS.md`;
- project-specific documentation, если она релевантна задаче.

Не предполагай stack, package manager, framework, команды или структуру директорий без подтверждения из проекта.

Если информация уже была подтверждена в текущей сессии и не изменилась, не исследуй ее повторно.

---

# Local instructions

Перед изменением файла проверь, нет ли более специфичного `AGENTS.md` в его directory tree.

Более локальные project instructions применяй только к соответствующей части репозитория.

Не загружай nested `AGENTS.md`, если задача не затрагивает его scope.

---

# Project navigation

## Graphify

Если существует и актуален `./graphify-out/`, используй `graphify-navigation` для первичной навигации по нетривиальной задаче.

Основные данные могут находиться в:

- `./graphify-out/graph.json`
- `./graphify-out/manifest.json`
- `./graphify-out/.graphify_analysis.json`

Используй Graphify для определения:

- модулей и связей;
- imports/dependencies;
- callers/callees;
- затронутых компонентов;
- потенциальных change points.

Graphify используется только для навигации.

Перед edit всегда проверяй фактический source code.

Если Graphify расходится с source, source является source of truth.

`./graphify-out/` считается read-only.

Не создавай и не обновляй Graphify автоматически.

## Without Graphify

Если Graphify отсутствует, неактуален или не нужен для локальной задачи:

- используй targeted search;
- ищи конкретные symbols/imports/routes/selectors/errors;
- открывай только релевантные файлы;
- расширяй исследование по одной подтвержденной зависимости за раз.

Не выполняй полный survey репозитория без необходимости.

---

# Commands

Используй только команды, реально определенные проектом.

Источники истины:

- package manager scripts;
- Makefile;
- task runner;
- project documentation;
- CI configuration;
- существующие developer scripts.

Не придумывай команды и script names.

Для проверки предпочитай наиболее узкую подходящую команду.

Не запускай install/update автоматически, если dependencies уже доступны и задача этого не требует.

---

# Architecture

Сохраняй существующие boundaries и patterns проекта.

Перед добавлением нового abstraction/module/service сначала проверь, нет ли уже подходящего механизма.

Не переносись между слоями и не меняй architecture только ради локального fix.

Если задача действительно требует архитектурного изменения, сначала определи:

- затронутые boundaries;
- public/internal contracts;
- compatibility;
- migration impact;
- blast radius.

---

# Generated and external code

Не редактируй автоматически:

- generated files;
- build output;
- vendored code;
- dependency sources;
- lockfiles без необходимости;
- Graphify output.

Если generated artifact должен измениться, предпочитай изменение его source/generator.

Если невозможно определить, generated ли файл, проверь repository conventions перед edit.

---

# Project conventions

Сначала следуй существующим conventions репозитория.

Определяй их по ближайшему релевантному коду, а не по случайным файлам из другой части проекта.

Учитывай, когда применимо:

- naming;
- module/export style;
- file organization;
- error handling;
- async patterns;
- state management;
- styling approach;
- API/client abstractions;
- test structure.

Не вводи новую convention для одной локальной задачи без необходимости.

---

# Frontend projects

Если проект содержит frontend, перед UI изменением определи фактические:

- framework/runtime;
- styling approach;
- component conventions;
- responsive strategy;
- browser targets, если они заданы проектом.

Для задач, связанных с DOM/CSS/layout/browser behavior, используй `frontend-ui`, когда его workflow дает пользу.

Не предполагай React, CSS Modules, Tailwind, конкретные breakpoints или browser support без подтверждения.

---

# Runtime debugging

Для runtime/API/state/DOM/async ошибок используй `runtime-debugging`, если требуется диагностика root cause.

Project-specific поведение имеет приоритет над generic fallback.

Особенно проверяй существующие:

- API contracts;
- initialization lifecycle;
- cache/session semantics;
- retry policy;
- error reporting;
- analytics side effects.

Не добавляй защиту только потому, что значение теоретически может быть `null`/`undefined`; сначала определи ожидаемый контракт.

---

# Tests and verification

Определи доступные проверки из самого проекта.

Выбирай минимальный набор, покрывающий измененное поведение.

При наличии нескольких уровней тестов предпочитай сначала наиболее targeted.

Не запускай broad suite только потому, что он существует.

Если проект имеет обязательные проверки, явно зафиксированные в CI/docs/local instructions, соблюдай их для затронутого scope.

---

# Configuration and secrets

Не изменяй реальные secrets, credentials, tokens и production values.

Не выводи содержимое secrets в logs/reports/final response.

При необходимости используй существующие example/template configuration files.

Не создавай новые environment variables, если задача может быть решена существующей конфигурацией.

---

# Repository hygiene

Не добавляй в repository временные:

- debug files;
- screenshots;
- generated reports;
- logs;
- local environment artifacts.

`./agent-reports/` используй только согласно глобальному `AGENTS.md`.

Перед завершением проверь, что временные диагностические изменения удалены.

---

# Project-specific extensions

Если проекту нужны постоянные специфичные правила, добавляй их ниже короткими секциями.

Подходящие примеры:

- browser support;
- domain invariants;
- API constraints;
- analytics naming;
- cache semantics;
- deployment restrictions;
- generated directories;
- обязательные verification commands.

Если правило относится только к одной директории или subsystem, предпочитай nested `AGENTS.md` рядом с этой областью вместо раздувания корневого файла.

Не добавляй сюда общие инженерные правила, уже существующие в `~/.codex/AGENTS.md`.
