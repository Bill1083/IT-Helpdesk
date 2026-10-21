import type { MetadataRoute } from 'next';

/**
 * Makes IT Desk installable as a desktop app (Edge/Chrome "Install IT Desk").
 * The installed app is just a window onto the server, so history is the same everywhere.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'IT Desk',
    short_name: 'IT Desk',
    description: 'Personal IT problem solver',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#18181b',
    // Launching it again focuses the open window instead of opening a second one.
    launch_handler: { client_mode: 'navigate-existing' },
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Right-click the taskbar icon for these.
    shortcuts: [
      { name: 'New chat', url: '/', icons: [{ src: '/icons/192', sizes: '192x192', type: 'image/png' }] },
      { name: 'Useful commands', url: '/commands', icons: [{ src: '/icons/192', sizes: '192x192', type: 'image/png' }] },
      { name: 'Settings', url: '/settings', icons: [{ src: '/icons/192', sizes: '192x192', type: 'image/png' }] },
    ],
  };
}
