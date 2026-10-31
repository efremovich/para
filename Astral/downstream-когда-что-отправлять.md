# Downstream: когда отправлять документ, а когда квитанцию

Заметка по работе `downstream-documents-gateway` (DDG) на контуре Точки (оператор **2MH**, гейт часто `00000000-0000-0000-0000-000000000000`).

В DDG попадают **не все** документы оператора, а только события для абонентов **с гейтом** при включённых фичах.

---

## Два разных канала

| Что | Тип сообщения в DDG | API / путь | Очередь Rabbit | Смысл |
| --- | --- | --- | --- | --- |
| **Документ / пакет** | `Package` | gRPC `Process` | документы / пакеты | Полный EDI-пакет: УОП, аннулирование, письмо и т.д. |
| **Транспортная квитанция (ТК)** | `Receipt` | gRPC `Notify` | `receipts:{gateId}` | Статус обработки исходящего ЛС (+/− ТК), без тела документа |

Это **не взаимозаменяемые** вещи:

- `Package` с `type: уведомлениеОПринятии` — документ УОП.
- `Receipt` через `Notify` — транспортная квитанция (ТК), не УОП.

`needNotificationOfReceipt` / «ИзвещениеОПолучении» — отдельный атрибут клиента (ИОП), не путать с УОП и не с ТК.

---

## Когда нужен документ (Package → Process)

### Условия

1. Фича **`leave_edi_enabled`** = true (на Точке включена).
2. У **получателя** документа есть гейт: `CheckGates(doc.Receiver)` не пустой.
3. Writer готовит сообщение в гейт: `PrepareDocflowForGate` → отправка в DDG через `Process`.

Если гейтов у получателя нет — документ остаётся во внутреннем EDI / роуминге и **в DDG не уходит**.

### Что обычно уходит как Package

- Исходящие/входящие пакеты для абонента 2MH с гейтом.
- Вторички документооборота, в том числе:
  - `…/УведомлениеОПринятии`
  - `…/ПредложениеОбАннулировании/УведомлениеОПринятии`
  - другие типы по коду ДО (неформалка 23 и др.).

Для УОП тело документа в storage часто не кладётся (`OnlySign`), в пакет идут подписи / метаданные.

### Практический признак «должен быть в downstream»

- Получатель пакета — абонент **2MH** (или иной IdЭДО с гейтом на point).
- В operator документ уже есть (например `history` содержит `/УведомлениеОПринятии`).
- В DDG в `messages` должен появиться `Package`, в теле — `documentId` / `relatedDocumentId`.

Роуминг **от 2MH к другому оператору** (2BM, 2BE, 2AE…) в DDG Точки **не должен** попадать.

### Как чинить, если Package нет

- Перевыставить контейнер в очередь: repaird `POST /v1/astral_wq/reprocess` (по `container_id` из `cont2docs`) → edi-sender → снова `Process` в DDG.
- `Republish` в DDG работает **только** если сообщение уже есть в `messages` (повторная публикация в Rabbit), отсутствующий пакет им не создать.

---

## Когда нужна квитанция (Receipt → Notify)

### Условия

1. Фича **`sending_notifications_enabled`** = true (на Точке включена).
2. Появилась транспортная квитанция по исходящему ЛС (успех или ошибка обработки).
3. У **отправителя исходного ЛС** есть гейт: `CheckGates(sender)` не пустой.
4. Есть связка контейнера / `PackageID` с ЛС (иначе Notify пропускается с предупреждением).

Тогда вызывается `downstream.Notify` → в БД DDG пишется `Receipt`, в Rabbit — `receipts:{gateId}`.

### Что несёт Receipt

- `packageId`, `documentsId`, `sender`, `receiver`, `gateId`
- `error` пустой = плюс ТК; непустой = минус ТК
- Тела УОП / файлов документа нет

### Практический признак

В `messages` есть запись с `messageType: ["Receipt"]` и `id` / `packageId` = идентификатор из Notify (часто id документа или package id из CSV).

### Как чинить, если Receipt нет

Утилита **astral_notify** (`notify`):

- CSV: `documentId`, `id` (= packageId), `gateId`, `sender`, `receiver`
- gRPC на DDG (`localhost:8090` через port-forward)
- Для Точки `gateId` обычно `00000000-0000-0000-0000-000000000000`

Повторный Notify по уже существующему +ТК в DDG допускается (логируется warn, переотправляется).

---

## Краткая схема выбора

```text
Нужно ли событие в DDG?
│
├─ Абонент без гейта → в DDG не отправляем
│
├─ Нужен полный документ / УОП / аннулирование / письмо для клиента гейта
│     → Package / Process
│     → чинить: astral_wq / Process / (Republish только если уже есть в messages)
│
└─ Нужен статус доставки/обработки исходящего ЛС (+/− ТК)
      → Receipt / Notify
      → чинить: astral_notify notify
```

| Вопрос | Ответ |
| --- | --- |
| Клиенту нужен сам УОП как документ? | **Package** |
| Клиенту нужен только факт приёма/ошибки по ЛС? | **Receipt (Notify)** |
| Документ ушёл в роуминг другому оператору? | В DDG Точки **не** слать |
| Есть УОП в operator, нет Package в DDG, получатель 2MH с гейтом? | Догонять **Package** (`astral_wq`), а не только Notify |
| Есть исходящий ЛС без ТК у абонента с гейтом? | Догонять **Notify** |

---

## Фичи Точки (prod)

- `leave_edi_enabled: true` — уход документов в DDG по гейтам получателя  
- `sending_notifications_enabled: true` — отправка ТК через Notify по гейтам отправителя ЛС  

Источник: `tochka-config/prod/features.yaml`, код `Edi.Operator` (`astral/writer.go`, `roseu/receiver.go`, `astral/writer.go` → `sendNotificationToSender`).

---

## Операционные команды

Контекст: `kubectl --context point-production -n edo-point-prod`.

### Receipt (Notify) через astral_notify

```bash
# gRPC DDG
kubectl --context point-production -n edo-point-prod \
  port-forward svc/downstream-documents-gateway 18090:8090

cd /home/efremov/Dev/Scripts/astral_notify
# в config: gateway.addr = 127.0.0.1:18090, token сервиса DDG
make build
./bin/astral_notify -config config.yaml notify -file nofty.csv
```

CSV (`notify`): колонки `documentId`, `id` (packageId), `gateId`, `sender`, `receiver`.  
Батчи по 20 + пауза 1 с при массовой досылке.

Проверка в `edo-downstream-documents-gateway-db`:

```sql
SELECT id, created, body->'messageType'
FROM messages
WHERE id = '<packageId>';
-- ожидаем ["Receipt"]
```

### Package через repaird → astral_wq

```bash
kubectl --context point-production -n edo-point-prod \
  port-forward svc/operator-repaird 18081:8080

# container_id — имя из cont2docs.cont (часто EDI_...zip)
curl -u tester:tester -X POST --get \
  'http://127.0.0.1:18081/v1/astral_wq/reprocess' \
  --data-urlencode 'container_id=<cont1>,<cont2>'
```

Документ → контейнер:

```sql
-- operator-db
SELECT cont FROM cont2docs WHERE doc = '<document_id>';
SELECT packet FROM packet2docs WHERE doc = '<document_id>';
```

Проверка очереди:

```sql
-- operator-queue-db
SELECT id, packet, created, done, err_code
FROM astral_wq
WHERE created > now() - interval '30 minutes'
ORDER BY created DESC;
```

Проверка Package в DDG:

```sql
SELECT m.id, m.created, doc->>'type', doc->>'documentId', doc->>'relatedDocumentId'
FROM messages m
CROSS JOIN LATERAL jsonb_array_elements(m.body->'message'->'docflows') df
CROSS JOIN LATERAL jsonb_array_elements(df->'documents') doc
WHERE doc->>'documentId' = '<document_id>';
-- для УОП: type ≈ уведомлениеОПринятии, messageType Package
```

### Что не путать при ремонте

| Симптом | Не делать | Делать |
| --- | --- | --- |
| Нет УОП как Package | Только Notify | `astral_wq` / Process |
| Нет ТК у абонента с гейтом | Только republish пустого id | `astral_notify notify` |
| Сообщение уже в `messages`, не ушло в Rabbit | astral_wq заново | DDG `Republish` |
| Получатель не 2MH / без гейта | Слать в DDG Точки | Не слать |

---

## Связь с инцидентом 19–27.10.2026 (кратко)

- Массово не хватало УОП в DDG как **Package** для получателей 2MH.
- Операционно закрывали канал **Receipt** через `astral_notify` (Notify) — это ТК, не замена Package-УОП.
- Досыл контейнеров через repaird/`astral_wq` вернул в DDG в основном Package типа **аннулирование**, плюс часть УОП.

При разборе дыр всегда разделять: «нет Package-УОП» и «нет Receipt/ТК».
