"use client";

import { useMutation } from "convex/react";
import { ChangeEvent, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

const ACCEPTED = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp", "application/pdf"];
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Receipt upload.
 *
 * The file goes straight to Convex storage as soon as it is chosen, rather
 * than on submit, so a slow upload does not sit between the user pressing
 * Submit and the expense being created — and so a failed upload is obvious
 * while they are still looking at the form.
 *
 * Type and size are checked here for immediate feedback, and again on the
 * server, which is the check that actually counts: the upload URL is reachable
 * without going through this component at all.
 */
export function ReceiptField({
  storageId,
  onChange,
  disabled,
  label,
}: {
  storageId: Id<"_storage"> | null;
  onChange: (storageId: Id<"_storage"> | null, fileName: string | null) => void;
  disabled?: boolean;
  /** Editing an existing expense keeps its receipt unless one is chosen here. */
  label?: string;
}) {
  const generateUploadUrl = useMutation(api.receipts.generateUploadUrl);
  const discardUpload = useMutation(api.receipts.discardUpload);

  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError("Receipts must be a JPEG, PNG, HEIC, WebP or PDF.");
      resetInput();
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Receipts must be 10 MB or smaller.");
      resetInput();
      return;
    }

    setUploading(true);
    const previous = storageId;

    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) {
        throw new Error(`Upload failed with status ${result.status}`);
      }

      const { storageId: uploaded } = (await result.json()) as { storageId: Id<"_storage"> };

      setFileName(file.name);
      onChange(uploaded, file.name);

      // Replacing a receipt leaves the old file with nothing pointing at it.
      // Best-effort: if this fails the expense is still correct, we have just
      // left a stray file behind.
      if (previous !== null) {
        try {
          await discardUpload({ storageId: previous });
        } catch {
          /* ignore */
        }
      }
    } catch {
      setError("That upload did not complete. Please try again.");
      resetInput();
    } finally {
      setUploading(false);
    }
  }

  function resetInput() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="receipt" className="text-sm font-medium">
        {label ?? (
          <>
            Receipt <span className="text-black/50 dark:text-white/50">(required)</span>
          </>
        )}
      </label>

      <input
        ref={inputRef}
        id="receipt"
        name="receipt"
        type="file"
        accept={ACCEPTED.join(",")}
        onChange={handleFile}
        disabled={disabled || uploading}
        aria-describedby="receipt-status"
        className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-black/15 file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium disabled:opacity-50 dark:file:border-white/20"
      />

      {/* Stays in the DOM and stays displayed even when empty: an aria-live
          region has to exist before its content changes for a screen reader to
          announce it, and a display:none region may not announce at all. It
          simply no longer reserves height — that was adding an odd gap above
          the next field. An empty block element is 0px tall on its own. */}
      <p id="receipt-status" className="text-sm" aria-live="polite">
        {uploading && <span className="text-black/60 dark:text-white/60">Uploading…</span>}
        {!uploading && error !== null && (
          <span className="text-red-600 dark:text-red-400">{error}</span>
        )}
        {!uploading && error === null && storageId !== null && (
          <span className="text-green-700 dark:text-green-400">
            Attached{fileName ? `: ${fileName}` : ""}
          </span>
        )}
      </p>
    </div>
  );
}
