# Инструкция: RDP-подключение через `xfreerdp` с выбором сервера через `fuzzel`

## 📌 Что это?

Этот скрипт позволяет удобно подключаться к нескольким удалённым рабочим столам (RDP-серверам) с помощью утилиты `wlfreerdp` (FreeRDP для Wayland), используя графический выбор сервера через меню `fuzzel` — минималистичный dmenu-совместимый лаунчер для Wayland.

Особенности:
- Поддержка нескольких RDP-серверов с разными учётными данными.
- Хранение паролей прямо в скрипте (удобно, но требует осторожности!).
- Автоматическое подключение с предустановленными параметрами (разрешение, буфер обмена, переподключение и т.д.).
- Интеграция с системой уведомлений (`notify-send`).
- Возможность запуска из меню приложений (благодаря `.desktop`-файлу).

---

## 🛠️ Требования

Скрипт работает **только в среде Wayland** и требует:

1. **`xfreerdp`** — клиент FreeRDP для Wayland.
2. **`fuzzel`** — меню выбора (аналог dmenu для Wayland).
3. **`notify-send`** (опционально) — для уведомлений после завершения сессии.

### Установка в NixOS

Добавьте в вашу конфигурацию NixOS:

```nix
environment.systemPackages = with pkgs; [
  freerdp  # содержит wlfreerdp
  fuzzel
  libnotify  # для notify-send
];
```

Или в Home Manager:

```nix
home.packages = with pkgs; [
  freerdp
  fuzzel
  libnotify
];
```

> 💡 Убедитесь, что `wlfreerdp` доступен в PATH. В NixOS он обычно находится в `/run/current-system/sw/bin/wlfreerdp`.

---

## 🔧 Настройка

1. **Сохраните скрипт** в удобное место, например:
   ```bash
   mkdir -p ~/.local/bin
   nano ~/.local/bin/rdp-fuzzel.sh
   ```
   Вставьте туда содержимое скрипта.

2. **Сделайте его исполняемым**:
   ```bash
   chmod +x ~/.local/bin/rdp-fuzzel.sh
   ```

3. **Настройте список серверов** в секции `SERVERS`:
   ```bash
   SERVERS=(
       "Имя|Хост|Порт|Пользователь|Разрешение|Пароль"
   )
   ```
   Пример:
   ```bash
   "Офис|rdp.office.local|3389|user|1920x1080|MySecretPass123"
   ```

   ⚠️ **Важно**: если пароль содержит символы `|`, `"`, `\`, их нужно экранировать или заключить в кавычки, как в примере:
   ```bash
   "Holding|...|\"71MCVqKh4|Wu\b;fB"
   ```

4. **(Опционально)** Установите `.desktop`-файл для запуска из меню приложений:

   Сохраните его как `~/.local/share/applications/rdp-fuzzel.desktop`:
```ini
   [Desktop Entry]
   Version=1.0
   Type=Application
   Name=RDP Connect (Fuzzel)
   Comment=Подключение к RDP серверам через fuzzel
   Exec=/home/efremov/.local/bin/rdp-fuzzel.sh
   Icon=preferences-desktop-remote-desktop
   Terminal=false
   Categories=Network;RemoteAccess;
   StartupNotify=true
```

   Замените путь в `Exec` на ваш реальный путь к скрипту.

   Обновите кэш приложений:
   ```bash
   update-desktop-database ~/.local/share/applications
   ```

---

## ▶️ Как использовать

1. **Запустите скрипт** одним из способов:
   - Через терминал: `~/.local/bin/rdp-fuzzel.sh`
   - Через меню приложений (если установлен `.desktop`-файл)
   - Через запуск приложений (например, `Super + Space` → введите "RDP")

2. **Выберите сервер** в появившемся меню `fuzzel`.

3. Скрипт автоматически подключится к выбранному серверу с указанными учётными данными.

4. После завершения сессии появится уведомление (если установлен `libnotify`).

---

## 🔒 Безопасность

- Пароли хранятся **в открытом виде** в скрипте. Это удобно, но **небезопасно**!
- Рекомендуется:
  - Ограничить права доступа к файлу:  
    ```bash
    chmod 600 ~/.local/bin/rdp-fuzzel.sh
    ```
  - Не использовать этот скрипт на общих или ненадёжных системах.
  - В будущем можно модифицировать скрипт для запроса пароля через `zenity` или `wofi --password`, чтобы не хранить его в коде.

---

## 🛠 Возможные доработки

- Заменить хранение паролей на запрос через безопасный диалог.
- Добавить поддержку доменов (`/d:DOMAIN`).
- Сохранять последние подключения.
- Использовать `wofi` вместо `fuzzel` (если предпочитаете).

---

✅ Готово! Теперь вы можете быстро и удобно подключаться к своим RDP-серверам в среде Wayland.

```bash
#!/run/current-system/sw/bin/bash

# Скрипт для подключения к RDP через wlfreerdp с выбором сервера через fuzzel
# Поддерживает несколько серверов с разными кредами

set -euo pipefail

# ========================
# Конфигурация серверов
# ========================

# Массив серверов: каждая строка — один сервер в формате:
# "Имя|Хост|Порт|Пользователь|Разрешение|Пароль"

SERVERS=(
	"Имя|Хост|Порт|Пользователь|Разрешение|Пароль"
)

# ========================
# Проверка зависимостей
# ========================

if ! command -v wlfreerdp &>/dev/null; then
	echo "❌ wlfreerdp не найден. Установи freerdp."
	echo "В NixOS: добавь 'freerdp' в systemPackages или home.packages"
	exit 1
fi

if ! command -v fuzzel &>/dev/null; then
	echo "❌ fuzzel не найден. Установи fuzzel."
	echo "В NixOS: добавь 'fuzzel' в systemPackages или home.packages"
	exit 1
fi

# ========================
# Подготовка данных для fuzzel
# ========================

# Создаем временный файл с опциями для fuzzel
FUZZEL_OPTIONS=$(mktemp)

for i in "${!SERVERS[@]}"; do
	name=$(echo "${SERVERS[$i]}" | cut -d'|' -f1)
	host=$(echo "${SERVERS[$i]}" | cut -d'|' -f2)
	port=$(echo "${SERVERS[$i]}" | cut -d'|' -f3)
	user=$(echo "${SERVERS[$i]}" | cut -d'|' -f4)
	echo "$name|$host|$port|$user" >>"$FUZZEL_OPTIONS"
done

# ========================
# Выбор через fuzzel
# ========================

SELECTED=$(fuzzel --dmenu --prompt="🌐 Выберите RDP-сервер: " <"$FUZZEL_OPTIONS")

# Очищаем временный файл
rm "$FUZZEL_OPTIONS"

# Проверяем, что пользователь выбрал сервер
if [ -z "$SELECTED" ]; then
	echo "❌ Сервер не выбран"
	exit 1
fi

# ========================
# Поиск выбранного сервера
# ========================

SELECTED_SERVER=""
for server in "${SERVERS[@]}"; do
	name=$(echo "$server" | cut -d'|' -f1)
	if [[ "$SELECTED" == "$name"* ]]; then
		SELECTED_SERVER="$server"
		break
	fi
done

if [ -z "$SELECTED_SERVER" ]; then
	echo "❌ Выбранный сервер не найден"
	exit 1
fi

# ========================
# Парсинг данных сервера
# ========================

IFS='|' read -r NAME HOST PORT USER SIZE PASSWORD <<<"$SELECTED_SERVER"

# ========================
# Формируем аргументы
# ========================

ARGS=(
	/v:"$HOST:$PORT"
	/u:"$USER"
	/size:"$SIZE"
	/clipboard
	/dynamic-resolution
	/cert:ignore
	+auto-reconnect
	-themes
	-wallpaper
	/auto-reconnect-max-retries:5
	/bpp:32
	/p:"$PASSWORD"
)

# ========================
# Запуск
# ========================

echo "🚀 Подключаюсь к: $NAME ($HOST:$PORT) как $USER..."

# Запускаем и ждём завершения
xfreerdp "${ARGS[@]}"

# После завершения — уведомление (если есть notify-send)
if command -v notify-send &>/dev/null; then
	notify-send "RDP" "Сессия с $NAME завершена" -u low
fi

echo "✅ Сессия завершена."

```