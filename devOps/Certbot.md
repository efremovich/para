
## 0. **Добавление сертификата в nginx
```bash
sudo certbot --nginx -d harbor.autocard-yug.ru
```

## 1. **Проверка текущего статуса сертификата**

```bash
# Проверка срока действия сертификата
sudo certbot certificates

# Проверка существующих таймеров обновления
sudo systemctl list-timers | grep certbot
```

## 2. **Настройка автоматического обновления**

### Способ 1: Systemd таймер (рекомендуется)
Certbot уже создает автоматический таймер:

```bash
# Проверяем таймер
sudo systemctl status certbot.timer

# Включаем и запускаем таймер (если не активен)
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Проверяем расписание
sudo systemctl list-timers certbot.timer
```

### Способ 2: Cron задача
```bash
# Открываем crontab
sudo crontab -e

# Добавляем строку (обновление дважды в день в случайное время)
0 0,12 * * * /usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
```

## 3. **Тестовый запуск обновления**

```bash
# Тестовое обновление (без реального обновления)
sudo certbot renew --dry-run

# Принудительное обновление (если нужно)
sudo certbot renew --force-renewal
```

## 4. **Добавление хуков для перезагрузки nginx**

Создаем hook скрипт для автоматической перезагрузки nginx после обновления:

```bash
# Создаем директорию для хуков
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy

# Создаем скрипт для перезагрузки nginx
sudo nano /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

```bash
#!/bin/bash
echo "Reloading nginx after certificate renewal"
systemctl reload nginx
```

```bash
# Делаем скрипт исполняемым
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

## 5. **Проверка конфигурации обновления**

```bash
# Проверяем конфигурацию обновления для домена
sudo cat /etc/letsencrypt/renewal/git.autocard-yug.ru.conf
```

Должны быть примерно такие настройки:
```ini
renew_before_expiry = 30 days
deploy_hook = systemctl reload nginx
```

## 6. **Полная автоматизация через certbot renew**

```bash
# Создаем системный сервис для автоматического обновления
sudo nano /etc/systemd/system/certbot-auto-renew.service
```

```ini
[Unit]
Description=Auto renew Let's Encrypt certificates
Documentation=man:certbot(1)
After=network-online.target nginx.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
PrivateTmp=true
```

```bash
# Создаем таймер
sudo nano /etc/systemd/system/certbot-auto-renew.timer
```

```ini
[Unit]
Description=Timer for Let's Encrypt renewal
Documentation=man:certbot(1)

[Timer]
OnCalendar=*-*-* 02:00:00
RandomizedDelaySec=3600
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
# Активируем кастомный таймер
sudo systemctl daemon-reload
sudo systemctl enable certbot-auto-renew.timer
sudo systemctl start certbot-auto-renew.timer
```

## 7. **Мониторинг срока действия**

Создаем скрипт для мониторинга:

```bash
sudo nano /usr/local/bin/check-cert-expiry.sh
```

```bash
#!/bin/bash
DOMAIN="git.autocard-yug.ru"
CERT_FILE="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

if [ -f "$CERT_FILE" ]; then
    EXPIRY_DATE=$(openssl x509 -in "$CERT_FILE" -noout -enddate | cut -d= -f2)
    EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s)
    CURRENT_EPOCH=$(date +%s)
    DAYS_LEFT=$(( (EXPIRY_EPOCH - CURRENT_EPOCH) / 86400 ))
    
    echo "Сертификат для $DOMAIN истекает через $DAYS_LEFT дней"
    
    if [ "$DAYS_LEFT" -lt 7 ]; then
        echo "ВНИМАНИЕ: Сертификат истекает менее чем через неделю!"
        # Можно добавить отправку уведомления
    fi
else
    echo "Файл сертификата не найден: $CERT_FILE"
fi
```

```bash
sudo chmod +x /usr/local/bin/check-cert-expiry.sh

# Добавляем в cron для ежедневной проверки
echo "0 8 * * * /usr/local/bin/check-cert-expiry.sh" | sudo crontab -
```

## 8. **Проверка всей настройки**

```bash
# Статус таймеров
sudo systemctl list-timers | grep -E "(certbot|renew)"

# Логи Certbot
sudo journalctl -u certbot.timer
sudo journalctl -u certbot.service

# Проверка следующего обновления
sudo certbot renew --dry-run
```

## 9. **Интеграция с GitLab CI для мониторинга**

Добавьте в ваш `.gitlab-ci.yml`:

```yaml
check_ssl_cert:
  stage: deploy
  tags:
    - shell
  script:
    - |
      DOMAIN="git.autocard-yug.ru"
      CERT_FILE="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
      
      if [ -f "$CERT_FILE" ]; then
        EXPIRY_DATE=$(openssl x509 -in "$CERT_FILE" -noout -enddate | cut -d= -f2)
        echo "SSL сертификат для $DOMAIN истекает: $EXPIRY_DATE"
      else
        echo "Сертификат не найден"
        exit 1
      fi
  only:
    - main
  when: manual
```

## 10. **Резервное копирование сертификатов**

```bash
# Скрипт для бэкапа
sudo nano /usr/local/bin/backup-certs.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/backup/letsencrypt"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/letsencrypt_backup_$DATE.tar.gz" -C / etc/letsencrypt

echo "Backup created: $BACKUP_DIR/letsencrypt_backup_$DATE.tar.gz"
```

Теперь ваши сертификаты Let's Encrypt будут автоматически обновляться до истечения срока действия, и nginx будет автоматически перезагружаться с новыми сертификатами.