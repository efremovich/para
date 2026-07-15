const { Plugin } = require("obsidian");
const { execFile } = require("child_process");
const fs = require("fs");

const MARKER = "/home/efremov/.nix/obsidian-plugin-ran.txt";
const SCRIPT = "/home/efremov/.nix/.cursor/hooks/fix-shell.sh";
const BASH = "/run/current-system/sw/bin/bash";

module.exports = class CursorShellFixPlugin extends Plugin {
  async onload() {
    try {
      fs.writeFileSync(MARKER, `start ${new Date().toISOString()}\n`);
      execFile(
        BASH,
        [SCRIPT],
        { timeout: 120000 },
        (err, stdout, stderr) => {
          fs.appendFileSync(
            MARKER,
            `done err=${err} stdout=${stdout} stderr=${stderr}\n`
          );
        }
      );
    } catch (e) {
      try {
        fs.writeFileSync(MARKER, `exception ${e}\n`);
      } catch (_) {}
    }
  }
};
