# abonent-migrator — 2026-05-04

- Разобран лог ошибки `SaveFile` / «файл не может быть пустым» для `transferDocumentFileToStorage`: при отсутствии файла в storage-v2 тело остаётся пустым (для основного документа нет fallback в API документов, в отличие от МЧД/подписи).
- Добавлены утилиты `cmd/storagediag-v2` (HTTP storage-v2: Ping + LoadFile) и `cmd/storagediag-storagegrpc` (gRPC целевой storage: Ping + тестовый SaveFile), без смешивания двух protobuf-клиентов в одном бинарнике.
- Проверка с тестового окружения: для `b4f85193f0584306bd6aa58a000880e8` LoadFile с HTTP storage-v2 вернул ~9 КБ тела (значит ошибка в логах могла быть из другой конфигурации `STORAGE_V2_*` или временного сбоя).

- Fallback проверки «файл уже в целевом storage»: сначала `LoadFileAttributes` (HEAD) в storage-v2, затем `GetFileAttrs` в gRPC storage; при успехе — пропуск `SaveFile` для документа/подписи; для МЧД — то же + цикл подписей. Добавлены методы в `storagev2.Client` и `storage.Storage`.

- abonent-migrator: `transferDocumentFileToStorage` — fallback на `GetDocumentBody` при `ErrNotFound`/пустом теле из storage v2; явная ошибка вместо `SaveFile` с пустыми байтами; тесты + `storagev2.ClientMock`, `storage.MockSavedBody`.
