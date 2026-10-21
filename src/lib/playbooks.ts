/**
 * Specialist playbooks. Instead of separate sub-agents (an extra model
 * round-trip per hand-off), the matching playbooks are injected into the one
 * model call. Routing is a keyword score, so it costs nothing and is instant;
 * the background classifier refines the categories for later steps.
 */

export interface Playbook {
  key: string;
  label: string;
  /** Product names: a mention of one outweighs generic words like "sign in". */
  strong: string[];
  keywords: string[];
  /** Where to look and what usually works; kept short so prompts stay fast. */
  guidance: string;
  /** Domains worth biasing research toward. */
  sources: string[];
}

export const PLAYBOOKS: Playbook[] = [
  {
    key: 'macos',
    strong: ['mac', 'macos', 'macbook', 'imac'],
    label: 'macOS',
    keywords: ['mac', 'macos', 'macbook', 'imac', 'finder', 'keychain', 'filevault', 'spotlight', 'sonoma', 'sequoia', 'tahoe', 'airdrop', 'safari', 'icloud', 'apple', 'gatekeeper', 'brew', 'homebrew', 'xcode', 'launchpad', 'dock'],
    guidance: `macOS: check macOS version first (Apple menu > About This Mac). Useful places: System Settings > Privacy & Security (app permissions, Full Disk Access, Screen Recording, blocked apps), Keychain Access (stale/duplicate credentials cause login loops), Console.app and ~/Library/Logs for errors, Activity Monitor. Common fixes in order: quit/relaunch app, clear app caches (~/Library/Caches/<bundle id>, ~/Library/Application Support/<app>), remove the app's keychain items, reset a TCC permission (tccutil reset <Service> <bundle id>), safe mode, reinstall. Managed Macs: configuration profiles in System Settings > General > Device Management can block settings — check before telling the user to change something. Give Terminal commands in code blocks and say whether sudo is needed.`,
    sources: ['support.apple.com', 'developer.apple.com', 'discussions.apple.com'],
  },
  {
    key: 'windows',
    strong: ['windows', 'win11', 'win10'],
    label: 'Windows',
    keywords: ['windows', 'win11', 'win10', 'pc', 'laptop', 'bitlocker', 'registry', 'powershell', 'cmd', 'explorer', 'defender', 'bsod', 'blue screen', 'driver', 'device manager', 'update', 'credential manager', 'outlook pst', 'start menu', 'taskbar'],
    guidance: `Windows: check edition/build first (winver). Useful places: Settings > Windows Update (pending reboots), Event Viewer (Windows Logs > Application/System), Device Manager, Credential Manager (stale credentials cause auth loops), Task Manager > Startup, Reliability Monitor. Repair ladder: restart (full shutdown with Shift), sfc /scannow then DISM /Online /Cleanup-Image /RestoreHealth (admin), reset the app (Settings > Apps > Advanced options), new user profile test, in-place repair. BitLocker recovery keys live in Entra ID (devices) or the user's Microsoft account. Give PowerShell in code blocks and say when it needs an elevated prompt.`,
    sources: ['learn.microsoft.com', 'support.microsoft.com', 'answers.microsoft.com'],
  },
  {
    key: 'rippling',
    strong: ['rippling'],
    label: 'Rippling',
    keywords: ['rippling', 'mdm', 'enrol', 'enroll', 'enrollment', 'device management', 'app shop', 'onboarding', 'offboarding', 'provision', 'deprovision', 'payroll', 'hris', 'pto', 'inventory', 'lock device', 'wipe'],
    guidance: `Rippling: this org uses Rippling for HR and as the MDM for company laptops (enrolment, app installs, OS update and security policies), and for app provisioning tied to employee records. Check in the admin console: the employee's record and role/department (drives app and policy assignment), Devices (enrolment status, last check-in, compliance, installed apps), the app's provisioning/SCIM status and error log, and pending approvals. Common causes: device not checked in recently (agent not running — have the user restart, then confirm check-in time), policy scoped by department/group the person isn't in, app assigned but not yet pushed, provisioning failed because the email/username doesn't match the downstream app. Remote actions: lock, restart, push app, wipe (destructive — confirm first). Rippling changes UI often; describe menus by name and say if you are unsure of the exact path.`,
    sources: ['help.rippling.com', 'rippling.com', 'developer.rippling.com'],
  },
  {
    key: 'slack',
    strong: ['slack'],
    label: 'Slack',
    keywords: ['slack', 'huddle', 'channel', 'workspace', 'slack connect', 'workflow builder', 'dm', 'slack app', 'slackbot', 'notification'],
    guidance: `Slack: first check status.slack.com and whether it fails on web (app.slack.com) too — web works but desktop doesn't means local app/cache. Desktop fixes: Help > Troubleshooting > Clear Cache and Restart / Reset App Data; sign out and back in; reinstall. SSO loops: clear Slack and the IdP session (Google/Microsoft) in the browser, check the SSO setting in Workspace settings > Authentication. Notifications: Preferences > Notifications plus OS notification permissions and Focus/Do Not Disturb. Admin side: Workspace/Org settings, member's account type (guest vs full), channel posting permissions, app approval queue, Slack Connect invitations. Integrations need re-authorisation after token revocation or password changes.`,
    sources: ['slack.com/help', 'status.slack.com', 'api.slack.com'],
  },
  {
    key: 'google',
    strong: ['google', 'gmail', 'gsuite', 'g suite'],
    label: 'Google Workspace',
    keywords: ['google', 'gmail', 'gsuite', 'g suite', 'workspace', 'drive', 'shared drive', 'calendar', 'meet', 'chrome', 'google docs', 'sheets', '2sv', 'google admin', 'alias', 'group', 'delegation'],
    guidance: `Google Workspace: check the Workspace Status Dashboard first for outages. Admin console (admin.google.com): Users (suspended? license assigned? 2-Step Verification enrolment, sign-in cookies reset), Groups (membership, external posting), Apps > Google Workspace > Gmail (routing, compliance, quarantine), Reporting > Audit and investigation (login, Drive, Gmail log events) — the email log search is the fastest way to trace a missing email. Drive sharing issues: shared drive membership vs file-level sharing, external sharing policy per OU. Calendar: delegation and resource booking permissions. Sign-in problems: verify which identity the app uses (Google vs Microsoft) since both exist here.`,
    sources: ['support.google.com/a', 'workspace.google.com', 'google.com/appsstatus'],
  },
  {
    key: 'microsoft',
    strong: ['microsoft', 'm365', 'o365', 'outlook', 'teams', 'onedrive', 'sharepoint', 'entra', 'intune'],
    label: 'Microsoft 365 / Entra ID',
    keywords: ['microsoft', 'm365', 'o365', 'office', 'outlook', 'teams', 'onedrive', 'sharepoint', 'excel', 'word', 'entra', 'azure ad', 'aad', 'intune', 'conditional access', 'authenticator', 'mfa', 'exchange', 'licence', 'license'],
    guidance: `Microsoft 365 / Entra ID: check Service health in the M365 admin center first. Entra admin center: user's sign-in logs (the failure reason and Conditional Access result are the fastest diagnosis), authentication methods (re-register MFA, Temporary Access Pass), licences, group membership. Exchange admin center: message trace for missing mail, mailbox permissions, rules. Outlook: new profile / repair Office (Settings > Apps > Microsoft 365 > Modify > Quick then Online Repair), Outlook Safe mode (outlook.exe /safe). Teams: sign out, clear cache (%appdata%\\Microsoft\\Teams or the new Teams package data), check policies. OneDrive: sync status icon, reset (onedrive.exe /reset). Give admin-center paths by name.`,
    sources: ['learn.microsoft.com', 'support.microsoft.com', 'admin.microsoft.com'],
  },
  {
    key: 'ai',
    strong: ['claude', 'anthropic', 'chatgpt', 'openai', 'gemini', 'copilot', 'mcp'],
    label: 'AI tools (Claude, ChatGPT, Gemini)',
    keywords: ['claude', 'anthropic', 'chatgpt', 'openai', 'gpt', 'gemini', 'copilot', 'connector', 'connectors', 'mcp', 'skill', 'skills', 'custom gpt', 'gpts', 'project', 'artifact', 'claude code', 'codex', 'llm', 'prompt', 'ai'],
    guidance: `AI tools: these products change monthly, so prefer current docs over memory and say when a feature may have changed. Check the plan first (Free/Pro/Team/Enterprise or Business) — connectors, skills, SSO, admin controls and data settings differ by plan. Claude: connectors and MCP servers are enabled by an org owner/admin (Admin settings > Connectors) before members can authenticate them; skills can be org-provisioned or uploaded per user; status at status.claude.com; help at support.claude.com; API docs at docs.claude.com. ChatGPT: workspace admin controls apps/connectors and GPT sharing; help.openai.com and status.openai.com. Gemini in Workspace is controlled in the Google Admin console per OU. Connector failures are usually: feature not enabled by admin, OAuth consent blocked by Google/Microsoft admin policy (needs admin consent or app allow-listing), expired token (disconnect and reconnect), or the user's account lacking access to the source data.`,
    sources: ['support.claude.com', 'docs.claude.com', 'help.openai.com', 'platform.openai.com', 'support.google.com'],
  },
  {
    key: 'network',
    strong: ['vpn', 'wifi', 'wi-fi'],
    label: 'Network & VPN',
    keywords: ['wifi', 'wi-fi', 'network', 'internet', 'vpn', 'dns', 'proxy', 'firewall', 'ethernet', 'router', 'ip', 'dhcp', 'latency', 'slow', 'disconnect', 'zscaler', 'tailscale', 'cloudflare warp'],
    guidance: `Network: scope it first — one user or many, one site or everywhere, one app or all. Quick checks: other sites load? another network (phone hotspot) works? Then: forget and rejoin Wi-Fi, renew DHCP, flush DNS (macOS: sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder · Windows: ipconfig /flushdns), check proxy/VPN/security agent (they intercept traffic and break specific apps), test with nslookup/ping/traceroute. VPN: client version, re-auth, split tunnelling, conflicting VPN/security agents.`,
    sources: ['support.apple.com', 'learn.microsoft.com'],
  },
  {
    key: 'hardware',
    strong: ['printer', 'dock', 'webcam'],
    label: 'Hardware & peripherals',
    keywords: ['printer', 'print', 'monitor', 'display', 'screen', 'dock', 'usb', 'usb-c', 'bluetooth', 'keyboard', 'mouse', 'headset', 'microphone', 'mic', 'camera', 'webcam', 'speaker', 'audio', 'battery', 'charger', 'scanner'],
    guidance: `Hardware: isolate the component — try another cable/port/dock, another device, built-in vs external. Displays/docks: dock firmware and DisplayLink driver versions matter; macOS needs Screen Recording permission for DisplayLink. Audio/camera: per-app device selection and OS privacy permissions (camera/microphone), then the meeting app's own settings. Bluetooth: remove and re-pair, reset the Bluetooth module. Printers: remove and re-add, use the manufacturer driver or IPP Everywhere/AirPrint, check the print queue.`,
    sources: ['support.apple.com', 'support.microsoft.com'],
  },
  {
    key: 'identity',
    strong: [],
    label: 'Accounts, SSO & MFA',
    keywords: ['password', 'reset', 'locked', 'lockout', 'login', 'log in', 'sign in', 'signin', 'sso', 'saml', 'oauth', 'mfa', '2fa', 'otp', 'authenticator', 'passkey', 'access denied', 'permission', 'account'],
    guidance: `Accounts & SSO: identify which identity provider the app trusts (Google Workspace, Microsoft Entra ID, or Rippling SSO) before changing anything. Check the IdP sign-in logs for the exact failure, whether the account is suspended/locked, licence/app assignment, and MFA enrolment. SSO loops are usually stale browser cookies or a cached session with the wrong account — try a private window first. For MFA device loss use the IdP's recovery path (backup codes, Temporary Access Pass, admin reset), and verify the person's identity before resetting.`,
    sources: ['support.google.com/a', 'learn.microsoft.com', 'help.rippling.com'],
  },
];

const BY_KEY = new Map(PLAYBOOKS.map((p) => [p.key, p]));

export function playbookLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function playbooksFor(keys: string[]): Playbook[] {
  return keys.map((k) => BY_KEY.get(k)).filter((p): p is Playbook => Boolean(p));
}

/** Instant keyword routing: up to `max` playbooks whose keywords appear in the text. */
export function routePlaybooks(text: string, max = 2): string[] {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9.+\- ]+/g, ' ')} `;
  const scored = PLAYBOOKS.map((p) => {
    let score = 0;
    const mentions = (word: string) => haystack.includes(` ${word} `) || haystack.includes(` ${word}s `);
    for (const name of p.strong) if (mentions(name)) score += 3;
    for (const keyword of p.keywords) {
      if (!p.strong.includes(keyword) && mentions(keyword)) score += keyword.includes(' ') ? 2 : 1;
    }
    return { key: p.key, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((s) => s.key);
}
