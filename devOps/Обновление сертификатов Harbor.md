# Обновление сертификатов Harbor

Сервер: **fuel-stage-app** (`ssh fuel-stage-app`)  
Registry: `harbor.autocard-yug.ru:41443`

## Как устроено

| Компонент | Путь |
|-----------|------|
| Let's Encrypt (источник) | `/etc/letsencrypt/live/harbor.autocard-yug.ru/` |
| Сертификат Harbor (nginx в Docker) | `/data/harbor/secret/cert/server.crt`, `server.key` |
| Конфиг Harbor | `/opt/harbor-install/harbor/harbor.yml` |
| Автообновление certbot | `certbot.timer` (2 раза в сутки) |
| Deploy-hook после renew | `/etc/letsencrypt/renewal-hooks/deploy/harbor.sh` |

Certbot обновляет файлы в `/etc/letsencrypt/`, но Harbor **не читает их напрямую** — при установке сертификаты копируются в `/data/harbor/secret/cert/`. Без deploy-hook Docker registry продолжает отдавать **старый** сертификат, даже если Let's Encrypt уже обновлён.

## Автоматическое обновление (настроено)

Deploy-hook `/etc/letsencrypt/renewal-hooks/deploy/harbor.sh`:

1. Срабатывает только если обновлён сертификат `harbor.autocard-yug.ru` (`RENEWED_LINEAGE`)
2. Копирует `fullchain.pem` → `server.crt`, `privkey.pem` → `server.key`
3. Выставляет права `10000:10000`, `chmod 600`
4. Перезапускает `docker compose restart proxy` в `/opt/harbor-install/harbor`

Планировщик:

```bash
systemctl status certbot.timer   # enabled, active
systemctl list-timers certbot.timer
```

## Проверка

```bash
# Срок действия на диске (Let's Encrypt)
sudo openssl x509 -in /etc/letsencrypt/live/harbor.autocard-yug.ru/fullchain.pem -noout -dates

# Срок действия в Harbor (должны совпадать)
sudo openssl x509 -in /data/harbor/secret/cert/server.crt -noout -dates

# Что отдаёт registry снаружи
echo | openssl s_client -connect harbor.autocard-yug.ru:41443 -servername harbor.autocard-yug.ru 2>/dev/null \
  | openssl x509 -noout -dates

# Docker больше не ругается на TLS (нужен login для pull)
docker pull harbor.autocard-yug.ru:41443/library/some-image:tag
```

Тест renew (без реального обновления, hook не меняет файлы при dry-run для уже валидных cert):

```bash
sudo certbot renew --dry-run
```

## Ручное обновление (если hook не сработал)

```bash
# 1. Обновить сертификат
sudo certbot renew --cert-name harbor.autocard-yug.ru
# или принудительно:
# sudo certbot renew --cert-name harbor.autocard-yug.ru --force-renewal

# 2. Применить в Harbor
sudo cp /etc/letsencrypt/live/harbor.autocard-yug.ru/fullchain.pem /data/harbor/secret/cert/server.crt
sudo cp /etc/letsencrypt/live/harbor.autocard-yug.ru/privkey.pem /data/harbor/secret/cert/server.key
sudo chown 10000:10000 /data/harbor/secret/cert/server.*
sudo chmod 600 /data/harbor/secret/cert/server.*

# 3. Перезапустить proxy
cd /opt/harbor-install/harbor && sudo docker compose restart proxy

# 4. Проверить
echo | openssl s_client -connect harbor.autocard-yug.ru:41443 -servername harbor.autocard-yug.ru 2>/dev/null | openssl x509 -noout -dates
```

Первичная выдача (если сертификата нет):

```bash
sudo certbot certonly --nginx -d harbor.autocard-yug.ru
# затем шаги 2–4
```

## Типичная ошибка

```
tls: failed to verify certificate: x509: certificate has expired
```

**Причина:** certbot обновил LE-сертификат, Harbor nginx всё ещё отдаёт старый из `/data/harbor/secret/cert/`.

**Решение:** ручное обновление (см. выше) или проверить, что deploy-hook исполняемый и `certbot renew` проходит успешно.

## Связанные заметки

- [[Certbot]] — общая настройка certbot на сервере

## История

- **2026-06-02:** истёк сертификат Harbor (30.05), certbot обновил LE, но Harbor не подхватил. Добавлен deploy-hook `harbor.sh`, сертификат применён вручную.
