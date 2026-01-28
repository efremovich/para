# Yandex Fetcher - Детальный анализ

## Обзор

Модуль `yandexfetcher/` реализует интеграцию с **Yandex Market Partner API** для получения данных о товарах, заказах, продажах, остатках и складах.

## Структура модуля

### Основные файлы

#### `client.go` - Основной клиент

**Ответственность:**
- Инициализация клиентов для всех настроенных аккаунтов Yandex Market
- Парсинг токенов в формате `campaignId:businessId:prefix:oauthToken:secret`
- Создание HTTP клиента с таймаутами
- Подключение к raw layer БД для кэширования

**Структура `apiClientImpl`:**
```go
type apiClientImpl struct {
    client      *http.Client
    businessID  string  // ID бизнеса в Яндекс.Маркете
    campaignID  string  // ID кампании (магазина)
    oauthToken  string  // OAuth токен для авторизации
    marketPlace entity.MarketPlace
    timeout     time.Duration
    metric      metrics.Collector
    rowLayerDB  *postgresdb.DBConnection
}
```

**Методы:**
- `New()` - создание клиентов для всех аккаунтов из конфигурации
- `setHeaders()` - установка заголовков для запросов (Api-Key, Content-Type, Accept)
- `GetMarketPlace()` - получение информации о маркетплейсе
- `Ping()` - проверка доступности API

#### `card.go` - Получение карточек товаров

**Методы:**
- `GetCards()` - основной метод получения карточек
  - Сначала пытается получить из raw layer
  - Если нет - обращается к API через `getOfferMappings()`
  - Получает параметры категорий через `getCategoryParameters()`
  - Конвертирует в `entity.Card` через `convertOfferToCard()`

- `getOfferMappings()` - получение всех товаров через пагинацию
  - Использует `paginatedRequest()` для обработки всех страниц
  - Эндпоинт: `POST /businesses/{businessId}/offer-mappings`

- `getCategoryParameters()` - получение параметров категории
  - Эндпоинт: `POST /category/{categoryId}/parameters`

- `convertOfferToCard()` - конвертация `OfferMapping` в `entity.Card`
  - Извлекает бренд, характеристики, категории, размеры
  - Обрабатывает медиафайлы (фото и видео)
  - Парсит `offerID` для получения `vendorID` и `vendorCode`

**Вспомогательные методы:**
- `extractCharacteristics()` - извлечение характеристик из товара
- `extractCategories()` - извлечение категорий
- `extractSizes()` - извлечение размеров
- `parseOfferID()` - парсинг ID товара продавца

#### `orders.go` - Получение заказов

**Методы:**
- `GetOrders()` - получение заказов
  - Сначала пытается получить из raw layer через `getOrdersRawLayer()`
  - Если нет - вызывает `getOrdersFromAPI()`
  - Конвертирует в `entity.Order` через `convertOrdersToEntity()`

- `getOrdersFromAPI()` - получение заказов из API с пагинацией
  - Эндпоинт: `POST /v1/businesses/{businessId}/orders`
  - Поддержка фильтрации по дате через `FilteroOrderDate`
  - Пагинация через `page_token`

- `convertOrdersToEntity()` - конвертация заказов
  - Пропускает заказы со статусом "DELIVERED"
  - Создает структуры: Status, Region, Warehouse, Card, PriceSize
  - Обрабатывает каждый товар в заказе отдельно
  - Извлекает размер из `offerID` через `extractSizeFromOfferID()`

**Особенности:**
- Каждый товар в заказе создает отдельную запись `entity.Order`
- Обработка ошибок парсинга `warehouseID`
- Определение отмененных заказов по статусу

#### `sales.go` - Получение продаж

**Методы:**
- `GetSales()` - получение продаж
  - Сначала пытается получить из raw layer через `getSalesRawLayer()`
  - Если нет - вызывает `getOrdersFromAPI()` (общая функция с orders)
  - Конвертирует в `entity.Sale` через `convertSalesToEntity()`

- `convertSalesToEntity()` - конвертация продаж
  - **Важно:** Пропускает заказы со статусом НЕ "DELIVERED" (только доставленные)
  - Остальная логика аналогична `convertOrdersToEntity()`

**Отличие от Orders:**
- Orders: пропускает DELIVERED заказы
- Sales: пропускает НЕ DELIVERED заказы (только доставленные)

#### `stocks.go` - Получение остатков

**Методы:**
- `GetStocks()` - получение остатков на всех складах
  - Сначала пытается получить из raw layer
  - Получает список складов через `GetWarehouses()`
  - Для каждого склада вызывает `getStocksForWarehouse()`
  - Обогащает остатки информацией о складе

- `getStocksForWarehouse()` - получение остатков для конкретного склада
  - Эндпоинт: `POST /businesses/{businessId}/warehouses/{warehouseId}/stocks`
  - Использует пагинацию через `paginatedRequest()`

- `convertStocksToEntity()` - конвертация остатков
  - Учитывает только доступные товары (AVAILABLE, FIT)
  - Пропускает товары с нулевым количеством
  - Парсит `offerID` для получения `vendorID` и `vendorCode`

#### `warehouse.go` - Получение складов

**Методы:**
- `GetWarehouses()` - получение списка складов
  - Сначала пытается получить из raw layer
  - Эндпоинт: `GET /campaigns/{campaignId}/warehouses`
  - Использует `campaignID`, если не указан - `businessID`

- Конвертация типов складов:
  - `FULFILLMENT` → TypeID=1 (склад маркетплейса)
  - `DROPSHIP` → TypeID=2 (прямая поставка)
  - `CROSSDOCK` → TypeID=3 (кросс-докинг)

#### `http_client.go` - HTTP клиент

**Методы:**
- `paginatedRequest()` - выполнение пагинированного запроса
  - Обрабатывает все страницы автоматически
  - Использует `nextPageToken` для навигации
  - Принимает функцию обработки страницы `processPage`

- `makeRequest()` - выполнение простого HTTP запроса
  - Поддержка POST и GET методов
  - Маршалинг тела запроса в JSON
  - Установка заголовков через `setHeaders()`
  - Обработка ошибок API с извлечением сообщений

**Особенности:**
- Обработка ошибок закрытия тела ответа
- Извлечение детальных сообщений об ошибках из ответа API

#### `entity.go` - Модели данных Yandex API

**Основные структуры:**
- `OfferMappingsResponse` - ответ списка товаров
- `OfferMapping` - маппинг товара продавца на карточку Яндекс.Маркета
- `Offer` - информация о товаре продавца
- `Mapping` - информация о маппинге товара
- `OrdersResponse` - ответ списка заказов
- `OrderInfo` - информация о заказе
- `StocksResponse` - ответ остатков
- `WarehousesResponse` - ответ складов
- `FilteroOrderDate` - фильтр по дате для заказов

#### `raw_layer.go` - Работа с Raw Layer

**Назначение:**
Кэширование сырых данных от API в отдельной БД для:
- Ускорения повторных запросов
- Сохранения истории данных
- Снижения нагрузки на API

**Методы:**
- `getCardsRawLayer()` - получение карточек из raw layer
- `getOrdersRawLayer()` - получение заказов из raw layer
- `getSalesRawLayer()` - получение продаж из raw layer
- `getStocksRawLayer()` - получение остатков из raw layer
- `getWarehousesRawLayer()` - получение складов из raw layer

## Особенности реализации

### 1. Общая функция для Orders и Sales

`getOrdersFromAPI()` используется и для заказов, и для продаж. Различие только в фильтрации при конвертации:
- Orders: пропускает DELIVERED
- Sales: пропускает НЕ DELIVERED

### 2. Пагинация

Все методы получения списков поддерживают пагинацию:
- Автоматическая обработка всех страниц
- Использование `page_token` для навигации
- Обработка пустых ответов

### 3. Raw Layer

Приоритет получения данных:
1. Сначала проверяется raw layer
2. Если данных нет или ошибка - обращение к API
3. Данные из API могут сохраняться в raw layer (если реализовано)

### 4. Парсинг offerID

Метод `parseOfferID()` обрабатывает различные форматы:
- `vendorCode` - простой формат
- `vendorCode-size` - с размером через дефис
- `prefix/vendorCode/size` - с префиксом и размером через слэш

### 5. Обработка ошибок

- Проверка статусов HTTP ответов
- Извлечение детальных сообщений об ошибках из JSON
- Логирование ошибок с контекстом

## API эндпоинты Yandex Market

### Товары
- `POST /businesses/{businessId}/offer-mappings` - список товаров
- `POST /category/{categoryId}/parameters` - параметры категории

### Заказы и продажи
- `POST /v1/businesses/{businessId}/orders` - заказы (с фильтрацией по дате)

### Склады
- `GET /campaigns/{campaignId}/warehouses` - список складов

### Остатки
- `POST /businesses/{businessId}/warehouses/{warehouseId}/stocks` - остатки на складе

## Конфигурация

Токен Yandex Market в формате:
```
campaignId:businessId:prefix:oauthToken:secret
```

Пример:
```
MARKETPLACE_3_TOKEN=12345:67890:prefix:OAuth_token_here:secret_key
```

## Связанные разделы

- [[data-receiver/Маркетплейсы|Маркетплейсы]] - общий интерфейс ExtAPIFetcher
- [[data-receiver/Архитектура|Архитектура]] - архитектура использования fetcher'ов
- [[data-receiver/Сущности|Сущности данных]] - доменные модели

## Новые реализации отчетов

### GetStockMetaReport - Отчет по остаткам на складах

**Файл:** `stock_report_meta.go`

**Метод API:** `POST /v2/reports/generateStocksOnWarehousesReport`

**Описание:**
Асинхронная генерация отчета по остаткам на складах. Отчет содержит информацию о товарах, их остатках, габаритах и складах.

**Методы:**
- `generateStocksReportTask()` - создание задачи на генерацию отчета
- `checkReportStatus()` - проверка статуса генерации отчета (используется общий метод)
- `downloadAndParseReport()` - скачивание ZIP архива и парсинг JSON
- `convertStockReportToEntity()` - конвертация данных отчета в `entity.StockReportMeta`

**Структура отчета:**
- Лист `stocks_on_warehouses.json` с полями:
  - `shopSku` → `VendorCode` (парсинг через parseOfferID)
  - `marketSku` → `Card.ExternalID`
  - `productName` → `Card.Title`
  - `availableForOrder` → `Quantity` (приоритет)
  - `valid` → `Quantity` (если availableForOrder = 0)
  - `warehouse` → `Warehouse.Title`
  - `length`, `width`, `height` → `Volume` (вычисление: см³ → литры)
  - `weight` → `Volume` (если габаритов нет)

**Особенности:**
- Асинхронная генерация с ожиданием готовности
- Адаптивный интервал проверки на основе `estimatedGenerationTime`
- Обработка статусов: DONE, FAILED, PROCESSING, NEW
- Обработка подстатусов: NO_DATA, EXCEEDED_SIZE, PARTIAL_DATA
- Парсинг ZIP архива с извлечением JSON файла
- Вычисление объема из габаритов или веса

**Cron задача:** `"10 04 * * *"` - каждый день в 04:10 UTC

### GetPromotion - Отчет по бусту продаж

**Файл:** `promotion_companies.go`

**Метод API:** `POST /v2/reports/generateBoostConsolidatedReport`

**Описание:**
Асинхронная генерация сводного отчета по бусту продаж за заданный период. Отчет содержит информацию по всем кампаниям буста продаж.

**Методы:**
- `generateBoostReportTask()` - создание задачи на генерацию отчета
- `downloadAndParseBoostReport()` - скачивание ZIP архива и парсинг JSON
- `convertBoostReportToPromotions()` - конвертация данных отчета в `[]*entity.Promotion`
- Вспомогательные методы:
  - `getOrCreatePromotion()` - получение или создание кампании
  - `aggregatePromotionMetrics()` - агрегация метрик
  - `createPromotionStats()` - создание статистики
  - `convertCampaignMapToSlice()` - преобразование мапы в слайс

**Структура отчета:**
- Лист `business_boost_consolidated.json` с полями:
  - `shopSku` → используется для создания Card через parseOfferID
  - `salesCampaignIds` → `Promotion.ExternalID` (парсинг строки с разделителями)
  - `salesCampaignNames` → `Promotion.Name`
  - `showsWithFee` → `PromotionStats.Views`
  - `clicksVendorWithFee` → `PromotionStats.Clicks`
  - `clicksCpaWithFee` → `PromotionStats.Atbs` (добавления в корзину)
  - `orderItemsWithFee` → `PromotionStats.Orders`
  - `orderItemsDeliveredWithFee` → `PromotionStats.SHKs`
  - `ordersGvmDeliveredWithFee` → `PromotionStats.OrderAmount`
  - `billedAmount` → `PromotionStats.Spent`

**Особенности:**
- Обработка множественных кампаний в одной строке отчета (парсинг `salesCampaignIds`)
- Группировка и агрегация данных по кампаниям
- Создание `PromotionStats` для каждой строки отчета с данными по товару
- Вычисление метрик: CTR, CPC, CR
- Парсинг `CardExternalID` из `shopSku` через `parseOfferID`

**Cron задача:** `"55 03 * * *"` - каждый день в 03:55 UTC

### DownloadReturnsReport - Отчет по возвратам и невыкупам

**Файл:** `returns_report.go`

**Метод API:** `POST /v2/reports/generateUnitedReturnsReport`

**Описание:**
Асинхронная генерация сводного отчета по невыкупам и возвратам за заданный период. Отчет содержит информацию о возвратах и невыкупах, а также о тех, которые готовы к выдаче.

**Методы:**
- `generateReturnsReportTask()` - создание задачи на генерацию отчета
- `downloadAndParseReturnsReport()` - скачивание ZIP архива и парсинг обоих JSON файлов
- `convertReturnsReportToEntity()` - конвертация данных отчета в `[]entity.ReturnsReport`
- Вспомогательные методы:
  - `createReturnsReportFromRow()` - создание ReturnsReport из строки отчета
  - `updateReturnsReportFromRangeRow()` - обновление данных из второго листа
  - `determineIsStatusActive()` - определение активности статуса

**Структура отчета:**
Отчет содержит два листа:

1. **Лист "Готовы к выдаче"** (`returns_ready_for_pickup.json`):
   - Возвраты и невыкупы, готовые к выдаче магазину

2. **Лист "Возвраты и невыкупы"** (`returns_for_selected_range.json`):
   - Все возвраты и невыкупы за выбранный период
   - Дополнительные поля: `returnReason`, `buyerComment`, `returnPickedDate`, `returnLostDate`

**Маппинг данных:**
- `orderId` → `ExternalID` (конвертация int64 → string)
- `returnNumber` → `ShkID` (конвертация int64)
- `status` → `Status`
- `type` → `ReturnType` ("RETURN" или "REJECT")
- `boxBarcodes` → `StickerID` (первый штрихкод)
- `placementDate` → `OrderDate` (парсинг даты)
- `dateOfReturnCreation` → `UpdatedAt` (парсинг даты)
- `shopSku` → используется для создания Card через parseOfferID
- `dispensingPlace` → `Warehouse.Title`

**Особенности:**
- Обработка двух листов отчета (готовы к выдаче + возвраты за период)
- Объединение данных из обоих листов по `ExternalID` (orderId)
- Определение `IsStatusActive` на основе статуса возврата
- Активные статусы: CREATED, ACCEPTED, IN_TRANSIT, READY_FOR_PICKUP
- Парсинг дат из строкового формата "2006-01-02"

## Общие паттерны для отчетов

Все три новых метода используют единый подход:

1. **Асинхронная генерация:**
   - Создание задачи → получение `reportId`
   - Цикл проверки статуса с адаптивным интервалом
   - Скачивание готового отчета

2. **Обработка ZIP архивов:**
   - Скачивание архива по ссылке (действительна 60 минут)
   - Распаковка и поиск нужных JSON файлов
   - Парсинг JSON в структуры данных

3. **Raw Layer поддержка:**
   - Проверка raw layer перед обращением к API
   - Возможность кэширования данных (заглушки реализованы)

4. **Обработка ошибок:**
   - Лимиты: 100 запросов в час на генерацию, 100 запросов в минуту на проверку статуса
   - Обработка статусов: FAILED, subStatus (NO_DATA, EXCEEDED_SIZE, PARTIAL_DATA)
   - Таймауты и retry логика для проверки статуса

5. **Константы:**
   - `maxStatusCheckAttempts = 30` - максимум попыток проверки статуса
   - `statusCheckInterval = 5 * time.Second` - интервал проверки статуса
   - Использование `estimatedGenerationTime` для адаптивного интервала
