'use client';

import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { uploadFile } from '@/lib/client';
import type { Attachment } from '@/lib/types';

/** Paste, drop or pick screenshots and log files; each uploads straight away. */
export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    setUploading((n) => n + files.length);
    await Promise.all(
      files.map(async (file) => {
        try {
          const attachment = await uploadFile(file);
          setAttachments((list) => [...list, attachment].slice(0, 8));
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Upload failed.');
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
  }, []);

  const onPaste = useCallback(
    (event: React.ClipboardEvent) => {
      const files = Array.from(event.clipboardData.files);
      if (files.length) {
        event.preventDefault();
        void add(files);
      }
    },
    [add],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      if (event.dataTransfer.files.length) {
        event.preventDefault();
        void add(Array.from(event.dataTransfer.files));
      }
    },
    [add],
  );

  return {
    attachments,
    uploading: uploading > 0,
    error,
    add,
    onPaste,
    onDrop,
    remove: (name: string) => setAttachments((list) => list.filter((a) => a.name !== name)),
    clear: () => setAttachments([]),
    /** Puts back attachments from a message that didn't send. */
    restore: (list: Attachment[]) => setAttachments(list),
  };
}

export function AttachButton({ onFiles }: { onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        aria-label="Attach screenshot or log"
        title="Attach screenshot or log (or paste / drop)"
        onClick={() => input.current?.click()}
        className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <Paperclip className="size-4" />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,.txt,.log,.json,.csv,.xml,.md,.yaml,.yml,.ini,.conf,.plist,.ps1,.sh,.reg"
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </>
  );
}

export function AttachmentList({
  attachments,
  uploading,
  onRemove,
}: {
  attachments: Attachment[];
  uploading?: boolean;
  onRemove?: (name: string) => void;
}) {
  if (attachments.length === 0 && !uploading) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((a) => (
        <div key={a.name} className="group relative">
          {a.kind === 'image' ? (
            <a href={`/api/uploads/${a.name}`} target="_blank" rel="noreferrer">
              <img
                src={`/api/uploads/${a.name}`}
                alt={a.original}
                className="size-16 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
              />
            </a>
          ) : (
            <a
              href={`/api/uploads/${a.name}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-16 max-w-[11rem] items-center gap-2 rounded-lg border border-zinc-200 px-3 text-xs dark:border-zinc-700"
            >
              <FileText className="size-4 shrink-0 text-zinc-500" />
              <span className="truncate">{a.original}</span>
            </a>
          )}
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${a.original}`}
              onClick={() => onRemove(a.name)}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-zinc-900 p-0.5 text-white shadow dark:bg-zinc-100 dark:text-zinc-900"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      ))}
      {uploading && (
        <div className="flex size-16 items-center justify-center rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700">
          <Loader2 className="size-4 animate-spin text-zinc-400" />
        </div>
      )}
    </div>
  );
}
