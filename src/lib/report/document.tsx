import fs from 'node:fs';
import path from 'node:path';

import { Document, Font, Image, Page, Text, View, renderToBuffer, type Styles } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/stylesheet';
import { Fragment, type ReactNode } from 'react';

import type { ReportContent, ReportMeta, StepResult } from './types';

/*
 * The service report. Its layout is fixed here in code: the AI only supplies
 * the text fields in ReportContent, so every export has the same sections in
 * the same order, however much or little happened in the chat.
 */

/* ------------------------------------------------------------ assets */

const ASSETS = path.join(process.cwd(), 'assets');
const FONT_DIR = path.join(ASSETS, 'fonts');
let fontsReady = false;

function registerFonts(): void {
  if (fontsReady) return;
  Font.register({
    family: 'Geist',
    fonts: [
      { src: path.join(FONT_DIR, 'Geist-Regular.ttf'), fontWeight: 400 },
      { src: path.join(FONT_DIR, 'Geist-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
      { src: path.join(FONT_DIR, 'Geist-Medium.ttf'), fontWeight: 500 },
      { src: path.join(FONT_DIR, 'Geist-SemiBold.ttf'), fontWeight: 600 },
      { src: path.join(FONT_DIR, 'Geist-Bold.ttf'), fontWeight: 700 },
    ],
  });
  Font.register({ family: 'GeistMono', src: path.join(FONT_DIR, 'GeistMono-Regular.ttf') });
  // Never split words with hyphens: commands, paths and names must stay intact.
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

/** The logo with a transparent background, 440 x 258 px. */
const LOGO_FILE = path.join(ASSETS, 'brand', 'logo.png');
const LOGO_RATIO = 440 / 258;
let logoCache: Buffer | null | undefined;

function logo(): Buffer | null {
  if (logoCache === undefined) logoCache = fs.existsSync(LOGO_FILE) ? fs.readFileSync(LOGO_FILE) : null;
  return logoCache;
}

/* ------------------------------------------------------------ tokens */

/** Brand colours, sampled from the Will Harvey Tech logo and letterhead. */
const C = {
  ink: '#1b2438',
  body: '#3b4456',
  muted: '#6b7385',
  faint: '#9aa1b0',
  line: '#e3e7ee',
  tint: '#f6f8fb',
  navy: '#24345c',
  blue: '#296dc6',
  blueSoft: '#eaf1fb',
};

const TONES = {
  good: { fg: '#166534', bg: '#dcfce7' },
  warn: { fg: '#92400e', bg: '#fef3c7' },
  bad: { fg: '#991b1b', bg: '#fee2e2' },
  neutral: { fg: '#3b4456', bg: '#e3e7ee' },
} as const;

const RESULT: Record<StepResult, { label: string; tone: keyof typeof TONES }> = {
  worked: { label: 'Worked', tone: 'good' },
  failed: { label: "Didn't work", tone: 'bad' },
  partial: { label: 'Partly worked', tone: 'warn' },
  checked: { label: 'Checked', tone: 'neutral' },
};

const PAGE_X = 48;
/** A4 height in points. Footer items are placed from the top: react-pdf
 * mis-places page-number elements anchored with `bottom` (thousands of
 * points off the page), while `top` is reliable. */
const PAGE_H = 841.89;
const FOOTER_RULE_TOP = PAGE_H - 43;
const FOOTER_TEXT_TOP = PAGE_H - 37;

const s: Styles = {
  page: {
    fontFamily: 'Geist',
    fontSize: 9.5,
    color: C.body,
    lineHeight: 1.5,
    paddingTop: 44,
    paddingBottom: 64,
    paddingHorizontal: PAGE_X,
    // Ligatures (ff, fi, tt) render fine but copy and search as "Staf" or
    // "Confrmed", so they are off.
    fontFeatureSettings: { liga: false, clig: false, dlig: false } as never,
  },
  p: { fontSize: 9.5, lineHeight: 1.55, color: C.body },
  empty: { fontSize: 9.5, color: C.muted, fontStyle: 'italic' },
  label: { fontSize: 7, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: C.muted },
  strong: { fontWeight: 600, color: C.ink },
};

/* ----------------------------------------------------------- helpers */

function formatDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(ms);
}

function rootCauseEmpty(meta: ReportMeta): string {
  return meta.type === 'Fix' ? 'Not confirmed. The issue was resolved without a definite cause being identified.' : 'Not applicable to this request.';
}

/**
 * GeistMono is 0.6 em per character, so at 8 pt a command box (page width
 * minus margins and padding, ~481 pt) holds 100 characters. Spaces wrap
 * normally; a single token longer than a line (a deep file path) would run
 * off the box, and letting react-pdf split it adds a "-" that reads as part
 * of the command. So long tokens are broken here, after a path or option
 * separator where possible, without adding anything.
 */
const COMMAND_CHARS = 96;

export function wrapCommand(command: string, max = COMMAND_CHARS): string {
  const breakAfter = /[\\/\-._:,=&|]/;
  return command
    .split('\n')
    .map((line) =>
      line
        .split(/( +)/)
        .map((token) => {
          const chunks: string[] = [];
          let rest = token;
          while (rest.length > max) {
            let cut = max;
            for (let i = max - 1; i > max * 0.5; i -= 1) {
              if (breakAfter.test(rest[i])) {
                cut = i + 1;
                break;
              }
            }
            chunks.push(rest.slice(0, cut));
            rest = rest.slice(cut);
          }
          chunks.push(rest);
          return chunks.join('\n');
        })
        .join(''),
    )
    .join('\n');
}

/* -------------------------------------------------------- primitives */

function Pill({ label, tone }: { label: string; tone: keyof typeof TONES }) {
  return (
    <View style={{ backgroundColor: TONES[tone].bg, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 7.5, fontWeight: 600, color: TONES[tone].fg, lineHeight: 1.3 }}>{label}</Text>
    </View>
  );
}

function Para({ children, empty }: { children: string | null | undefined; empty: string }) {
  return children?.trim() ? <Text style={s.p}>{children}</Text> : <Text style={s.empty}>{empty}</Text>;
}

function Dot() {
  return <View style={{ width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: C.blue, marginTop: 5.5, marginRight: 8 }} />;
}

/*
 * Content under a heading is built as a list of rows, and the heading is
 * glued to the first row, so a heading can never be left alone at the
 * bottom of a page with its content on the next.
 */

function Section({ heading, rows, style }: { heading: ReactNode; rows: ReactNode[]; style?: Style }) {
  const [first, ...rest] = rows;
  return (
    <View style={style}>
      <View wrap={false}>
        {heading}
        {first}
      </View>
      {rest}
    </View>
  );
}

/** A sub-heading glued to its first row, flattened into the parent's rows. */
function subsection(title: string, rows: ReactNode[], first: boolean): ReactNode[] {
  const [head, ...rest] = rows;
  return [
    <View key={`${title}-head`} wrap={false} style={{ marginTop: first ? 2 : 14 }}>
      <Text style={{ fontSize: 10, fontWeight: 600, color: C.ink, marginBottom: 6 }}>{title}</Text>
      {head}
    </View>,
    ...rest.map((row, i) => <Fragment key={`${title}-${i}`}>{row}</Fragment>),
  ];
}

function paraRows(text: string | null | undefined, empty: string): ReactNode[] {
  return [
    <Para key="p" empty={empty}>
      {text}
    </Para>,
  ];
}

function emptyRow(text: string): ReactNode[] {
  return [
    <Text key="empty" style={s.empty}>
      {text}
    </Text>,
  ];
}

function labelledRows(items: { label: string; text: string }[], empty: string): ReactNode[] {
  if (!items.length) return emptyRow(empty);
  return items.map((item, i) => (
    <View key={i} style={{ flexDirection: 'row', marginTop: i ? 5 : 0 }} wrap={false}>
      <Dot />
      <Text style={[s.p, { flex: 1 }]}>
        <Text style={s.strong}>{item.label}: </Text>
        {item.text}
      </Text>
    </View>
  ));
}

function bulletRows(items: string[], empty: string): ReactNode[] {
  if (!items.length) return emptyRow(empty);
  return items.map((text, i) => (
    <View key={i} style={{ flexDirection: 'row', marginTop: i ? 4 : 0 }} wrap={false}>
      <Dot />
      <Text style={[s.p, { flex: 1 }]}>{text}</Text>
    </View>
  ));
}

function timelineRows(attempts: ReportContent['attempts']): ReactNode[] {
  if (!attempts.length) return emptyRow('No troubleshooting steps were recorded.');
  return attempts.map((a, i) => {
    const r = RESULT[a.result];
    const last = i === attempts.length - 1;
    return (
      <View key={i} style={{ flexDirection: 'row' }} wrap={false}>
        <View style={{ width: 18, alignItems: 'center' }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: a.result === 'worked' ? TONES.good.fg : C.navy, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 7.5, fontWeight: 700, color: '#ffffff', lineHeight: 1 }}>{i + 1}</Text>
          </View>
          {!last && <View style={{ width: 1, flexGrow: 1, backgroundColor: C.line, marginVertical: 2 }} />}
        </View>
        <View style={{ flex: 1, marginLeft: 10, paddingBottom: last ? 0 : 9, flexDirection: 'row', gap: 10 }}>
          <Text style={[s.p, { flex: 1, paddingTop: 1 }]}>{a.action}</Text>
          <View style={{ paddingTop: 2 }}>
            <Pill label={r.label} tone={r.tone} />
          </View>
        </View>
      </View>
    );
  });
}

function commandRows(commands: ReportMeta['commands']): ReactNode[] {
  if (!commands.length) return emptyRow('No commands were run.');
  return commands.map((c, i) => (
    <View key={i} style={{ marginTop: i ? 7 : 0 }} wrap={false}>
      {c.title && <Text style={{ fontSize: 8, color: C.muted, marginBottom: 2 }}>{c.title}</Text>}
      <View style={{ backgroundColor: C.ink, borderRadius: 4, paddingHorizontal: 9, paddingVertical: 6 }}>
        <Text style={{ fontFamily: 'GeistMono', fontSize: 8, color: '#e3e7ee', lineHeight: 1.45 }}>{wrapCommand(c.command)}</Text>
      </View>
    </View>
  ));
}

/** Label/value cells in rows of three. */
function MetaGrid({ cells }: { cells: { label: string; value: ReactNode }[] }) {
  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 3) rows.push(cells.slice(i, i + 3));
  return (
    <View style={{ backgroundColor: C.tint, borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 10, gap: 9 }} wrap={false}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 12 }}>
          {[0, 1, 2].map((c) => {
            const cell = row[c];
            return (
              <View key={c} style={{ flex: 1 }}>
                {cell && (
                  <>
                    <Text style={[s.label, { marginBottom: 2 }]}>{cell.label}</Text>
                    {typeof cell.value === 'string' ? <Text style={{ fontSize: 9.5, color: C.ink, fontWeight: 500 }}>{cell.value}</Text> : cell.value}
                  </>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function NumberedHeading({ n, title }: { n: number; title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 5, marginBottom: 8 }}>
      <Text style={{ fontSize: 8.5, fontWeight: 600, color: C.blue, width: 22 }}>{String(n).padStart(2, '0')}</Text>
      <Text style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{title}</Text>
    </View>
  );
}

/** Repeats on every page: brand, reference and page numbers. */
function Footer({ meta }: { meta: ReportMeta }) {
  const text = { position: 'absolute', top: FOOTER_TEXT_TOP, fontSize: 7.5, color: C.faint } as const;
  return (
    <>
      <View fixed style={{ position: 'absolute', left: PAGE_X, right: PAGE_X, top: FOOTER_RULE_TOP, height: 1, backgroundColor: C.line }} />
      <Text fixed style={{ ...text, left: PAGE_X, right: PAGE_X + 80 }}>
        {meta.preparedBy} · IT service report · {meta.reference}
      </Text>
      <Text fixed style={{ ...text, left: PAGE_X, right: PAGE_X, textAlign: 'right' }} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </>
  );
}

/** From page two on: a slim header so loose pages are still identifiable. */
function RunningHeader({ meta }: { meta: ReportMeta }) {
  return (
    <View
      fixed
      style={{ position: 'absolute', top: 22, left: PAGE_X, right: PAGE_X, flexDirection: 'row', justifyContent: 'space-between' }}
      render={({ pageNumber }) =>
        pageNumber > 1 ? (
          <>
            <Text style={{ fontSize: 7.5, fontWeight: 600, color: C.navy }}>{meta.preparedBy}</Text>
            <Text style={{ fontSize: 7.5, color: C.faint }}>
              {meta.client ? `${meta.client} · ` : ''}
              {meta.reference}
            </Text>
          </>
        ) : null
      }
    />
  );
}

/** Logo centred once at the top of page one, then the report label and a brand rule. */
function Letterhead({ meta }: { meta: ReportMeta }) {
  const image = logo();
  const height = 54;
  return (
    <View style={{ alignItems: 'center', marginBottom: 20 }}>
      {image ? (
        <Image src={{ data: image, format: 'png' }} style={{ height, width: height * LOGO_RATIO }} />
      ) : (
        <Text style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{meta.preparedBy}</Text>
      )}
      <Text style={[s.label, { color: C.blue, marginTop: 10, letterSpacing: 1.6 }]}>IT service report</Text>
      <View style={{ flexDirection: 'row', alignSelf: 'stretch', marginTop: 10 }}>
        <View style={{ flex: 1, height: 2, backgroundColor: C.navy }} />
        <View style={{ width: 90, height: 2, backgroundColor: C.blue }} />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ report */

interface Props {
  content: ReportContent;
  meta: ReportMeta;
  timeZone: string;
}

function Report({ content, meta, timeZone }: Props) {
  const date = formatDate(meta.closedAt ?? meta.openedAt, timeZone);
  const technical = [
    ...subsection('Steps taken', timelineRows(content.attempts), true),
    ...subsection('Technical details', labelledRows(content.technical, 'No technical changes were needed.'), false),
    ...subsection('Commands used', commandRows(meta.commands), false),
  ];
  const sections: { title: string; rows: ReactNode[] }[] = [
    { title: 'Objective', rows: paraRows(content.objective, 'No objective recorded.') },
    { title: 'Solution', rows: paraRows(content.solution, 'No solution recorded.') },
    { title: 'Technical implementation', rows: technical },
    { title: 'Root cause', rows: paraRows(content.rootCause, rootCauseEmpty(meta)) },
    { title: 'Recommendations', rows: bulletRows(content.followUp, 'No further action needed.') },
  ];
  return (
    <Page size="A4" style={s.page}>
      <RunningHeader meta={meta} />
      <Letterhead meta={meta} />
      <Text style={{ fontSize: 21, fontWeight: 600, color: C.ink, lineHeight: 1.22 }}>{content.title}</Text>
      <Text style={{ fontSize: 10, color: C.muted, marginTop: 4, marginBottom: 14 }}>
        {meta.type} · {date}
      </Text>
      <MetaGrid
        cells={[
          { label: 'Prepared for', value: meta.client ?? 'Not specified' },
          { label: 'Prepared by', value: meta.preparedBy },
          { label: 'Date', value: date },
          { label: 'Reference', value: meta.reference },
          { label: 'Reported by', value: meta.reportedBy ?? 'Not specified' },
          { label: 'Outcome', value: <Pill label={meta.outcome} tone={meta.outcomeTone} /> },
        ]}
      />
      {sections.map((sec, i) => (
        <Section key={sec.title} style={{ marginTop: i ? 18 : 20 }} heading={<NumberedHeading n={i + 1} title={sec.title} />} rows={sec.rows} />
      ))}
      <Footer meta={meta} />
    </Page>
  );
}

export async function renderReport(props: Props): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(
    <Document title={props.content.title} author={props.meta.preparedBy} subject={`IT service report ${props.meta.reference}`} creator="IT Desk">
      <Report {...props} />
    </Document>,
  );
}
