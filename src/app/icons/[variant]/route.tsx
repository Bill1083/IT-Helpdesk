import { ImageResponse } from 'next/og';

/** App icons for the install manifest, drawn from the same wrench as icon.svg. */

const VARIANTS = { '192': { size: 192, maskable: false }, '512': { size: 512, maskable: false }, maskable: { size: 512, maskable: true } };
type Variant = keyof typeof VARIANTS;

// Rendered once at build time; any other variant is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

const WRENCH = 'M19.6 8.4a5 5 0 0 0-6.3 6.3l-5.4 5.4a1.8 1.8 0 0 0 2.5 2.5l5.4-5.4a5 5 0 0 0 6.3-6.3l-2.9 2.9-2.4-.6-.6-2.4z';

export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const { size, maskable } = VARIANTS[(await params).variant as Variant];
  // Maskable icons fill the whole square and keep the logo inside the 80% safe zone.
  const logo = maskable ? size * 0.8 : size;
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#18181b',
          borderRadius: maskable ? 0 : size * 0.25,
        }}
      >
        <svg width={logo} height={logo} viewBox="0 0 32 32">
          <path d={WRENCH} fill="#fafafa" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
