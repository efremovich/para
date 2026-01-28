# Data Receiver Service

## Описание проекта

Data Receiver Service — сервис для получения и обработки данных с различных маркетплейсов. Сервис предоставляет единый интерфейс для работы с API маркетплейсов и сохраняет данные в централизованную базу данных.

## Поддерживаемые маркетплейсы

- **Wildberries** (`wbfetcher/`) - интеграция с Wildberries API
- **Ozon** (`ozonfetcher/`) - интеграция с Ozon Seller API
- **Yandex Market** (`yandexfetcher/`) - интеграция с Yandex Market Partner API
- **OdinAss** (`odincfetcer/`) - интеграция с OdinAss API

## Технологический стек

- **Язык**: Go 1.22
- **API**: gRPC + HTTP Gateway (REST)
- **База данных**: PostgreSQL
- **Брокер сообщений**: NATS
- **Трейсинг**: Jaeger
- **Мониторинг**: Prometheus + Grafana
- **Миграции БД**: Goose

## Структура документации

- [[data-receiver/Архитектура|Архитектура]] - описание архитектуры проекта
- [[data-receiver/Маркетплейсы|Маркетплейсы]] - интерфейсы и реализации для работы с маркетплейсами
- [[data-receiver/Сущности|Сущности данных]] - доменные модели и сущности
- [[data-receiver/API|API]] - описание gRPC и HTTP API
- [[data-receiver/Конфигурация|Конфигурация]] - настройки и конфигурация сервиса
- [[data-receiver/Инфраструктура|Инфраструктура]] - инфраструктурные компоненты
- [[data-receiver/YandexFetcher|Yandex Fetcher]] - детальный анализ модуля Yandex Market

## Основные возможности

- Получение карточек товаров (Cards)
- Получение остатков товаров (Stocks)
- Получение информации о складах (Warehouses)
- Получение заказов (Orders)
- Получение продаж (Sales)
- Получение отчетов о продажах (Sale Reports)
- Получение информации об акциях (Promotions)
- Получение медиа-кампаний (Media Campaigns)
- Получение отчетов об удержаниях (Deductions Reports)
- И другие функции

## Ссылки

- [Wildberries API](https://openapi.wildberries.ru/)
- [Ozon API](https://docs.ozon.com/api/seller/)
- [Yandex Market Partner API](https://yandex.ru/dev/market/partner-api/doc/ru/)
