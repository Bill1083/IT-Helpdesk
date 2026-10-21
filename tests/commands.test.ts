import { describe, expect, it } from 'vitest';

import { extractCodeBlocks, fingerprint, guessPlatform, heuristicDanger } from '@/lib/commands';
import { guessMode } from '@/lib/modes';

describe('request modes', () => {
  it('guesses the kind of request', () => {
    expect(guessMode('How do I add a shortcut to Windows Explorer from a OneDrive folder?')).toBe('howto');
    expect(guessMode("Sam's Outlook keeps crashing on startup")).toBe('fix');
    expect(guessMode("How do I fix Outlook? It keeps crashing")).toBe('fix');
    expect(guessMode('Plan the migration of 40 Macs from Jamf to Rippling')).toBe('plan');
    expect(guessMode('1Password vs Bitwarden for a 30 person team')).toBe('options');
    expect(guessMode('Which password manager should we use?')).toBe('options');
  });
});

describe('command extraction', () => {
  const reply = [
    '### Step 1 - Clear cache',
    '```powershell',
    'Remove-Item "$env:APPDATA\\Slack\\Cache" -Recurse -Force',
    '```',
    'Output looks like:',
    '```text',
    'Done.',
    '```',
    '```bash',
    'sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder',
    '```',
  ].join('\n');

  it('keeps commands and skips output blocks', () => {
    const blocks = extractCodeBlocks(reply);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ lang: 'powershell' });
    expect(blocks[1].code).toContain('dscacheutil');
  });

  it('sorts commands into Windows and Mac', () => {
    const [win, mac] = extractCodeBlocks(reply);
    expect(guessPlatform(win.code, win.lang)).toBe('windows');
    expect(guessPlatform(mac.code, mac.lang)).toBe('mac');
    expect(guessPlatform('ipconfig /flushdns', '')).toBe('windows');
    expect(guessPlatform('defaults write com.apple.finder AppleShowAllFiles -bool true', 'bash')).toBe('mac');
    expect(guessPlatform('curl -I https://example.com', 'bash')).toBe('other');
  });

  it('treats retyped commands as the same entry', () => {
    expect(fingerprint('  ipconfig   /flushdns \n')).toBe(fingerprint('IPCONFIG /flushdns'));
  });
});

describe('danger floor', () => {
  it('rates destructive commands high', () => {
    expect(heuristicDanger('diskutil eraseDisk APFS Blank disk2').level).toBe(5);
    expect(heuristicDanger('sudo rm -rf /').level).toBe(5);
    expect(heuristicDanger('rm -rf ~/Library/Caches/com.tinyspeck.slackmacgap').level).toBe(4);
    expect(heuristicDanger('Remove-Item "$env:APPDATA\\Slack" -Recurse -Force').level).toBe(4);
    expect(heuristicDanger('reg delete "HKCU\\Software\\Foo" /f').level).toBe(4);
  });

  it('rates everyday commands low and flags admin rights', () => {
    expect(heuristicDanger('ipconfig /all').level).toBe(1);
    expect(heuristicDanger('Get-Service | Where Status -eq Running').level).toBe(1);
    const flush = heuristicDanger('sudo dscacheutil -flushcache');
    expect(flush.level).toBe(2);
    expect(flush.needsAdmin).toBe(true);
    expect(heuristicDanger('sfc /scannow').needsAdmin).toBe(true);
  });
});
