# API Data Receiver Service

## Обзор

Сервис предоставляет два интерфейса для доступа:
1. **gRPC API** - основной интерфейс для внутренней коммуникации
2. **HTTP Gateway (REST)** - REST API через gRPC Gateway для внешнего доступа

## gRPC API

### Определение API

API определено в файле `proto/data-receiver-service/receiver-service.proto` и генерируется в `pkg/data-receiver-service/`.

### Основные методы

#### Получение данных

- `ReceiveCards()` - получение карточек товаров
- `ReceiveWarehouses()` - получение информации о складах
- `ReceiveStocks()` - получение остатков товаров
- `ReceiveOrders()` - получение заказов
- `ReceiveSales()` - получение продаж
- `ReceiveSaleReport()` - получение отчетов о продажах
- `ReceiveCostFrom1C()` - получение стоимости из 1C
- `ReceivePromotionCompanies()` - получение информации об акциях
- `ReceiveMediaCampaigns()` - получение медиа-кампаний
- `ReceivePaidStorage()` - получение отчетов о платном хранилище
- `ReceivePaidAcceptance()` - получение отчетов о платной приемке
- `ReceiveReturnsReport()` - получение отчетов о возвратах
- `ReceiveStockMeta()` - получение метаданных остатков
- `ReceiveSalesFunnel()` - получение воронки продаж
- `ReceiveDeductionsReport()` - получение отчетов об удержаниях

#### Фиды данных

- `OfferFeed()` - фид товаров
- `StockFeed()` - фид остатков
- `VkCardsFeed()` - фид карточек для VK
- `CardsInfosFeed()` - фид информации о карточках

#### Утилиты

- `PingDB()` - проверка подключения к БД
- `PingNATS()` - проверка подключения к NATS

### Структура запросов

Все методы приема данных принимают `PackageDescription`:
- `MarketPlaceID` - ID маркетплейса
- `UpdatedAt` - дата обновления для фильтрации
- `Limit` - лимит записей
- Другие параметры фильтрации

## HTTP Gateway (REST API)

### Доступ

HTTP Gateway доступен по адресу, указанному в конфигурации (`GATEWAY_HTTP_HOST` и `GATEWAY_HTTP_PORT`).

### Swagger документация

Swagger документация генерируется автоматически из protobuf определений и доступна в `docs/swagger/`.

Путь к Swagger UI настраивается через `GATEWAY_SWAGGER_PATH`.

### Аутентификация

HTTP Gateway использует токен аутентификации, настраиваемый через `GATEWAY_AUTH_TOKEN`.

### Примеры запросов

#### Получение карточек товаров

```http
POST /api/v1/receive-cards
Authorization: Bearer {token}
Content-Type: application/json

{
  "marketPlaceId": 1,
  "updatedAt": "2026-01-26T00:00:00Z",
  "limit": 100
}
```

#### Получение заказов

```http
POST /api/v1/receive-orders
Authorization: Bearer {token}
Content-Type: application/json

{
  "marketPlaceId": 1,
  "updatedAt": "2026-01-26T00:00:00Z",
  "limit": 1000
}
```

## Реализация

### gRPC сервер

Реализация находится в `internal/controller/receive_grpc.go`:

- Реализует интерфейс `CardReceiverServer` из сгенерированного protobuf кода
- Использует `ReceiverCoreService` для выполнения бизнес-логики
- Обрабатывает ошибки и возвращает статусы gRPC

### HTTP Gateway

Реализация находится в `internal/controller/gateway.go`:

- Создает gRPC Gateway mux через `runtime.NewServeMux()`
- Регистрирует HTTP handlers для каждого gRPC метода
- Настраивает Swagger UI
- Добавляет middleware для аутентификации и логирования

### Middleware

В `internal/controller/middleware/`:
- Аутентификация через токен
- Логирование запросов
- Обработка ошибок
- Метрики Prometheus

## Генерация кода

### Protobuf

Для генерации gRPC и Gateway кода используется команда:

```bash
make generate-data-receiver-api
```

Это генерирует:
- Go код для gRPC (`receiver-service.pb.go`)
- Go код для gRPC сервиса (`receiver-service_grpc.pb.go`)
- Go код для Gateway (`receiver-service.pb.gw.go`)
- Swagger документацию (`docs/swagger/api.swagger.json`)

### Зависимости

Требуются следующие инструменты (устанавливаются через `make install-deps`):
- `protoc-gen-go` - генератор Go кода из protobuf
- `protoc-gen-go-grpc` - генератор gRPC кода
- `protoc-gen-grpc-gateway` - генератор Gateway кода
- `protoc-gen-openapiv2` - генератор Swagger документации

## Обработка ошибок

### gRPC статусы

- `OK` - успешное выполнение
- `INVALID_ARGUMENT` - неверные параметры запроса
- `INTERNAL` - внутренняя ошибка сервиса
- `UNAVAILABLE` - сервис недоступен

### HTTP статусы

- `200 OK` - успешное выполнение
- `400 Bad Request` - неверный запрос
- `401 Unauthorized` - отсутствует или неверный токен
- `500 Internal Server Error` - внутренняя ошибка

## Мониторинг

Все запросы логируются и метрики собираются через:
- **Jaeger** - трейсинг запросов
- **Prometheus** - метрики производительности
- **Logger** - структурированное логирование

## Связанные разделы

- [[data-receiver/Архитектура|Архитектура]] - архитектура контроллеров
- [[data-receiver/Конфигурация|Конфигурация]] - настройка Gateway
- [[data-receiver/Инфраструктура|Инфраструктура]] - инфраструктура для API
