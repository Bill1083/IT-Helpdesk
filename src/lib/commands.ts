/**
 * Command helpers for the Useful commands library. Pure module: used on the
 * server when capturing commands and in the browser for inline warnings.
 */

import type { CommandPlatform } from '@/lib/types';

export const DANGER_LEVELS = [
  { level: 1, label: 'Safe', hint: 'Read-only, or trivially undone' },
  { level: 2, label: 'Low', hint: 'Restarts something or changes a user setting; easy to undo' },
  { level: 3, label: 'Moderate', hint: 'Changes system settings or removes software; reversible with effort' },
  { level: 4, label: 'High', hint: 'Deletes data or weakens security; hard to undo' },
  { level: 5, label: 'Critical', hint: 'Can wipe a disk or leave the machine unusable' },
] as const;

export function dangerLabel(level: number): string {
  return DANGER_LEVELS[Math.min(5, Math.max(1, Math.round(level))) - 1].label;
}

/** Fenced blocks that hold data rather than something to run. */
const NOT_COMMANDS = new Set(['json', 'yaml', 'yml', 'xml', 'ini', 'toml', 'csv', 'html', 'md', 'markdown', 'text', 'txt', 'plaintext', 'output', 'log', 'console-output']);

export interface CodeBlock {
  lang: string;
  code: string;
}

export function extractCodeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  for (const match of markdown.matchAll(/```([\w+#.-]*)[^\n]*\n([\s\S]*?)```/g)) {
    const lang = match[1].toLowerCase();
    const code = match[2].replace(/\r/g, '').trim();
    if (!code || code.length > 4000 || NOT_COMMANDS.has(lang)) continue;
    blocks.push({ lang, code });
  }
  return blocks;
}

/** Same command typed slightly differently still counts as one entry. */
export function fingerprint(code: string): string {
  return code
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

const WINDOWS_LANGS = new Set(['powershell', 'ps', 'ps1', 'pwsh', 'cmd', 'bat', 'batch', 'dos']);
const MAC_LANGS = new Set(['zsh', 'applescript', 'osascript']);
const WINDOWS_MARKERS =
  /\b(Get|Set|New|Remove|Start|Stop|Restart|Test|Invoke|Add|Clear|Enable|Disable|Reset|Repair|Install|Uninstall|Update|Import|Export|Resolve)-[A-Z][A-Za-z]+|\$env:|%\w+%|[A-Za-z]:\\|\b(ipconfig|netsh|sfc|dism|winget|gpupdate|gpresult|dsregcmd|wmic|bcdedit|robocopy|taskkill|msiexec|reg(\.exe)?\s+(add|query|delete)|manage-bde|certutil|whoami \/|shutdown \/|net use|wsreset|onedrive\.exe)\b/i;
const MAC_MARKERS =
  /\b(defaults (read|write|delete)|launchctl|diskutil|brew|tccutil|dscacheutil|networksetup|softwareupdate|pmset|profiles|security (find|delete|add)|mdfind|mdutil|plutil|scutil|xattr|codesign|spctl|csrutil|osascript|sysadminctl|dscl|killall|open -a|system_profiler|sw_vers)\b|~\/Library|\/Library\/|\/Applications\/|\/System\//;

export function guessPlatform(code: string, lang: string): CommandPlatform {
  if (WINDOWS_LANGS.has(lang)) return 'windows';
  if (MAC_LANGS.has(lang)) return 'mac';
  const windows = WINDOWS_MARKERS.test(code);
  const mac = MAC_MARKERS.test(code) || /\bsudo\b/.test(code);
  if (windows && !mac) return 'windows';
  if (mac && !windows) return 'mac';
  return 'other';
}

const RULES: { level: number; pattern: RegExp; reason: string }[] = [
  { level: 5, pattern: /\bdiskpart\b|\bclear-disk\b|\bformat(-volume)?\s+(-\w+\s+)*[a-z]:/i, reason: 'Can erase or repartition a drive' },
  { level: 5, pattern: /\bdiskutil\s+(erase\w*|partitiondisk|zerodisk|secureerase|apfs\s+delete\w*)/i, reason: 'Erases or repartitions a disk' },
  { level: 5, pattern: /\bdd\s[^\n]*\bof=\/dev\/|\bmkfs(\.\w+)?\b/i, reason: 'Writes directly to a disk device' },
  { level: 5, pattern: /\brm\s+(-\w+\s+)*-\w*r\w*\s+(\/|~\/?|\$HOME\/?|\/\*)(\s|$)/, reason: 'Deletes everything on the disk or in the home folder' },
  { level: 5, pattern: /\bsystemreset\b|\breset-computer\b/i, reason: 'Factory-resets the machine' },
  { level: 4, pattern: /\brm\s+(-\w+\s+)*-\w*r|\bremove-item\b[^\n]*-recurse|\b(rd|rmdir)\s+\/s\b|\bdel\s[^\n]*\/s\b/i, reason: 'Deletes folders and everything inside them' },
  { level: 4, pattern: /\breg(\.exe)?\s+delete\b|\bremove-itemproperty\b/i, reason: 'Deletes registry entries' },
  { level: 4, pattern: /\bbcdedit\b|\bmanage-bde\b/i, reason: 'Changes boot or BitLocker configuration' },
  { level: 4, pattern: /\bcsrutil\b|\bspctl\s+--master-disable\b|\bset-mppreference\b[^\n]*-disable/i, reason: 'Turns off built-in security protection' },
  { level: 4, pattern: /\bnet\s+user\s+\S+\s+\/delete\b|\bremove-localuser\b|\bdscl\s[^\n]*-delete\b|\bsysadminctl\s+-deleteuser/i, reason: 'Deletes a user account' },
  { level: 4, pattern: /\bsecurity\s+delete-|\btccutil\s+reset\s+all\b|\bprofiles\s+(remove|-R)\b/i, reason: 'Removes saved credentials, permissions or profiles' },
  { level: 4, pattern: /\b(chmod|chown)\s+-R\b|\bsc(\.exe)?\s+delete\b/i, reason: 'Changes many files or removes a service' },
  { level: 3, pattern: /\breg(\.exe)?\s+add\b|\bset-itemproperty\b|\bnew-itemproperty\b/i, reason: 'Edits the registry' },
  { level: 3, pattern: /\bset-executionpolicy\b/i, reason: 'Changes which scripts may run' },
  { level: 3, pattern: /\bnetsh\s+(int(erface)?\s+ip\s+reset|winsock\s+reset|advfirewall)/i, reason: 'Resets networking or firewall settings' },
  { level: 3, pattern: /\bdefaults\s+delete\b|\blaunchctl\s+(unload|bootout|disable|remove)\b/i, reason: 'Removes app settings or disables a background service' },
  { level: 3, pattern: /\b(stop|disable|set)-service\b|\bsc(\.exe)?\s+(stop|config)\b|\bpmset\b/i, reason: 'Changes a system service or power setting' },
  { level: 3, pattern: /\bxattr\s+-(c|d|r)|\bwinget\s+uninstall\b|\bmsiexec\s+\/x\b|\bbrew\s+uninstall\b|\bremove-appxpackage\b/i, reason: 'Removes software or security attributes' },
  { level: 2, pattern: /\b(killall|taskkill|stop-process|pkill)\b/i, reason: 'Force-quits apps (unsaved work is lost)' },
  { level: 2, pattern: /\bshutdown\b|\brestart-computer\b|\breboot\b/i, reason: 'Restarts or shuts down the machine' },
  { level: 2, pattern: /\bsfc\s+\/scannow|\bdism\b[^\n]*\/(restorehealth|cleanup-image)/i, reason: 'System repair; slow and needs a restart afterwards' },
  { level: 2, pattern: /\bipconfig\s+\/(release|renew)\b/i, reason: 'Briefly disconnects the network' },
  { level: 2, pattern: /\bwinget\s+(install|upgrade)\b|\bbrew\s+(install|upgrade)\b|\bsudo\b/i, reason: 'Installs software or runs with admin rights' },
];

const ADMIN = /\bsudo\b|-Verb\s+RunAs|\b(sfc|dism|bcdedit|diskpart|manage-bde)\b|HKLM[:\\]|HKEY_LOCAL_MACHINE/i;

/**
 * A pattern-based floor for the danger rating. The AI rating can raise it
 * but never lower it, so a model under-rating `rm -rf` cannot hide it.
 */
export function heuristicDanger(code: string): { level: number; reasons: string[]; needsAdmin: boolean } {
  let level = 1;
  const reasons: string[] = [];
  for (const rule of RULES) {
    if (rule.pattern.test(code)) {
      level = Math.max(level, rule.level);
      if (!reasons.includes(rule.reason)) reasons.push(rule.reason);
    }
  }
  return { level, reasons, needsAdmin: ADMIN.test(code) };
}
