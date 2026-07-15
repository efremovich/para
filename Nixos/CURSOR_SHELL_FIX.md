# CURSOR SHELL FIX — run once in a terminal

```bash
/run/current-system/sw/bin/bash /home/efremov/.nix/.cursor/hooks/fix-shell.sh
```

Or:

```bash
bash /home/efremov/.nix/PLEASE_RUN_IN_TERMINAL.sh
```

Cursor agent cannot spawn shell because `~/.nix-profile/bin/zsh` is missing and profile is EROFS.
