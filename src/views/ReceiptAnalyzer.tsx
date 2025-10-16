import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Download, Loader2, Trash2, Save, Edit2, CheckCircle2, AlertCircle, X } from "lucide-react";

import {
  analyzeReceipt,
  getGeminiKey,
  isGeminiConfigured,
  type GeminiImagePayload,
  type ReceiptFields,
} from "../lib/gemini";
import { cn } from "../lib/utils";

type HistoryEntry = ReceiptFields & {
  id: string;
  imageName: string;
  createdAt: string;
};

type BulkSummary = {
  succeeded: number;
  failed: number;
  errors: Array<{ file: string; message: string }>;
};

const HISTORY_STORAGE_KEY = "kkomaentle-receipt-history";
const KEY_VERIFIED_STORAGE_KEY = "kkomaentle-gemini-key-hash";

const hashKey = async (value: string) => {
  if (typeof window === "undefined") {
    return value;
  }

  if (!window.crypto?.subtle) {
    try {
      return window.btoa(value);
    } catch {
      return value;
    }
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const buffer = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const toBase64 = (file: File): Promise<GeminiImagePayload> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const base64 = result.replace(/^data:.+;base64,/, "");
        const mimeMatch = result.match(/^data:(.+);base64,/);
        resolve({
          data: base64,
          mimeType: file.type || mimeMatch?.[1] || "image/png",
        });
      } else {
        reject(new Error("Failed to read image file."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });

const downloadCSV = (entries: HistoryEntry[]) => {
  if (entries.length === 0) {
    return;
  }

  const header = [
    "Date",
    "Item",
    "Description",
    "Merchant",
    "Amount",
    "Notes",
    "Image Name",
    "Analyzed At",
  ];
  const rows = entries.map((entry) => [
    entry.usageDate,
    entry.usageItem,
    entry.usageDescription,
    entry.usagePlace,
    entry.usageAmount,
    entry.notes ?? "",
    entry.imageName,
    entry.createdAt,
  ]);

  const csvLines = [header, ...rows].map((columns) =>
    columns
      .map((column) => {
        const value = (column ?? "").toString().replace(/"/g, '""');
        return /[",\n]/.test(value) ? `"${value}"` : value;
      })
      .join(","),
  );

  const blob = new Blob(["\ufeff" + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `receipt-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const FIELD_ORDER: Array<keyof ReceiptFields> = [
  "usageDate",
  "usageItem",
  "usageDescription",
  "usagePlace",
  "usageAmount",
  "notes",
];

const defaultFields: ReceiptFields = {
  usageDate: "",
  usageItem: "",
  usageDescription: "",
  usagePlace: "",
  usageAmount: "",
  notes: "",
};
const ReceiptAnalyzer = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ReceiptFields | null>(null);
  const [form, setForm] = useState<ReceiptFields>(defaultFields);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [isKeyVerified, setIsKeyVerified] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ completed: number; total: number }>({
    completed: 0,
    total: 0,
  });
  const [bulkSummary, setBulkSummary] = useState<BulkSummary | null>(null);
  const [pendingAction, setPendingAction] = useState<"single" | "bulk" | null>(null);
  const analyzedPreviewsRef = useRef<Map<string, string>>(new Map());
  const [analysisPreview, setAnalysisPreview] = useState<string | null>(null);
  const [previewHeight, setPreviewHeight] = useState(320);
  const lastFocusedEntryRef = useRef<string | null>(null);

  const geminiKey = getGeminiKey();

  const currentFile =
    activeFileIndex !== null && activeFileIndex < selectedFiles.length
      ? selectedFiles[activeFileIndex]!
      : selectedFiles[0] ?? null;
  const activePreview = preview ?? analysisPreview;
  const normalizeField = (value: unknown) => (value ?? "").toString().trim();
  const changedFields = useMemo(() => {
    if (!analysis || !currentEntryId) {
      return new Set<keyof ReceiptFields>();
    }
    const keys = Object.keys(form) as Array<keyof ReceiptFields>;
    return new Set(
      keys.filter((key) => normalizeField(form[key]) !== normalizeField(analysis[key])),
    );
  }, [analysis, currentEntryId, form]);
  const isFieldChanged = (key: keyof ReceiptFields) => changedFields.has(key);
  const previewSourceHint = useMemo(() => {
    if (preview && currentFile) {
      return `Previewing ${currentFile.name}`;
    }
    if (analysisPreview && currentEntryId) {
      return "Preview from analyzed history";
    }
    return null;
  }, [analysisPreview, currentEntryId, currentFile, preview]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setInitialLoading(false);
      return;
    }

    const stored = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHistory(
            parsed.filter(
              (item): item is HistoryEntry =>
                typeof item?.id === "string" && typeof item?.usageItem === "string",
            ),
          );
        }
      } catch (storageError) {
        console.warn("Failed to restore receipt history from localStorage.", storageError);
      }
    }

    setInitialLoading(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!geminiKey) {
      setIsKeyVerified(false);
      window.sessionStorage.removeItem(KEY_VERIFIED_STORAGE_KEY);
      return;
    }

    const restoreVerification = async () => {
      try {
        const storedHash = window.sessionStorage.getItem(KEY_VERIFIED_STORAGE_KEY);
        if (!storedHash) {
          setIsKeyVerified(false);
          return;
        }
        const currentHash = await hashKey(geminiKey);
        if (storedHash === currentHash) {
          setIsKeyVerified(true);
        } else {
          window.sessionStorage.removeItem(KEY_VERIFIED_STORAGE_KEY);
          setIsKeyVerified(false);
        }
      } catch (storageError) {
        console.warn("Gemini key verification restore failed.", storageError);
      }
    };

    void restoreVerification();
  }, [geminiKey]);

  useEffect(() => {
    if (!analysis || !currentEntryId) {
      return;
    }
    if (lastFocusedEntryRef.current === currentEntryId) {
      return;
    }
    lastFocusedEntryRef.current = currentEntryId;

    const nextKey = FIELD_ORDER.find((key) => {
      const value = form[key];
      return (value ?? "").toString().trim() === "";
    });
    if (!nextKey) {
      return;
    }

    const target = document.getElementById(`receipt-field-${nextKey}`);
    if (target instanceof HTMLElement) {
      target.focus();
    }
  }, [analysis, currentEntryId, form]);

  const shortBase = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return `${window.location.origin}${window.location.pathname}?view=receipt`;
  }, []);

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return "0 B";
    }
    const units = ["B", "KB", "MB", "GB"];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    const precision = value >= 10 || exponent === 0 ? 0 : 1;
    return `${value.toFixed(precision)} ${units[exponent]}`;
  };

  const attachFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    setError(null);
    setBulkSummary(null);

    setSelectedFiles((prev) => {
      const existing = prev ?? [];
      const deduped = files.filter(
        (candidate) =>
          !existing.some(
            (item) =>
              item.name === candidate.name &&
              item.size === candidate.size &&
              item.lastModified === candidate.lastModified,
          ),
      );
      const combined = [...existing, ...deduped];

      if (combined.length > 0) {
        const nextIndex = existing.length === 0 ? 0 : activeFileIndex ?? existing.length;
        setActiveFileIndex(Math.min(nextIndex, combined.length - 1));
        if (preview) {
          URL.revokeObjectURL(preview);
        }
        setPreview(URL.createObjectURL(combined[Math.min(nextIndex, combined.length - 1)]!));
      } else {
        setActiveFileIndex(null);
        if (preview) {
          URL.revokeObjectURL(preview);
        }
        setPreview(null);
      }

      return combined;
    });

    event.target.value = "";
  };

  const handleSelectActiveFile = (index: number) => {
    const file = selectedFiles[index];
    if (!file) {
      return;
    }
    setActiveFileIndex(index);
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setPreview(URL.createObjectURL(file));
  };

  const handleRemoveSelectedFile = (index: number) => {
    setSelectedFiles((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      if (next.length === 0) {
        setActiveFileIndex(null);
        if (preview) {
          URL.revokeObjectURL(preview);
        }
        setPreview(null);
        return next;
      }

      let nextIndex: number | null = null;
      if (activeFileIndex === null) {
        nextIndex = 0;
      } else if (activeFileIndex > index) {
        nextIndex = activeFileIndex - 1;
      } else if (activeFileIndex === index) {
        nextIndex = Math.min(index, next.length - 1);
      } else {
        nextIndex = activeFileIndex;
      }

      setActiveFileIndex(nextIndex);
      if (preview) {
        URL.revokeObjectURL(preview);
      }
      if (nextIndex === null) {
        setPreview(null);
      } else {
        setPreview(URL.createObjectURL(next[nextIndex]!));
      }

      return next;
    });
  };

  const clearSelectedFiles = () => {
    setSelectedFiles([]);
    setActiveFileIndex(null);
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setPreview(null);
  };
  const analyzeFile = async (file: File) => {
    const imagePayload = await toBase64(file);
    const result = await analyzeReceipt(imagePayload);

    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      ...result,
      imageName: file.name,
      createdAt: new Date().toISOString(),
    };

    setHistory((prev) => [entry, ...prev]);

    const previewUrl = `data:${imagePayload.mimeType};base64,${imagePayload.data}`;
    analyzedPreviewsRef.current.set(entry.id, previewUrl);

    return { entry, result, previewUrl };
  };

  const runSingleAnalysis = async () => {
    const file = currentFile;
    if (!file) {
      setError("Select a receipt image to analyze.");
      return;
    }

    setPending(true);
    setError(null);
    setBulkSummary(null);

    try {
      const { entry, result, previewUrl } = await analyzeFile(file);
      lastFocusedEntryRef.current = null;
      setAnalysisPreview(previewUrl);
      setAnalysis(result);
      setForm(result);
      setCurrentEntryId(entry.id);
      if (activeFileIndex !== null) {
        handleRemoveSelectedFile(activeFileIndex);
      } else if (selectedFiles.length > 0) {
        handleRemoveSelectedFile(0);
      }
    } catch (requestError) {
      console.error(requestError);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "An error occurred while analyzing the receipt.",
      );
      throw requestError;
    } finally {
      setPending(false);
    }
  };

  const runBulkAnalysis = async () => {
    if (selectedFiles.length === 0) {
      setError("Attach receipt images before running a bulk analysis.");
      return;
    }

    const files = [...selectedFiles];
    setError(null);
    setBulkSummary(null);
    setBulkPending(true);
    setBulkProgress({ completed: 0, total: files.length });

    const failures: Array<{ file: string; message: string }> = [];
    let successes = 0;
    let processed = 0;
    let firstSuccess: { entry: HistoryEntry; result: ReceiptFields; previewUrl: string } | null = null;

    for (const file of files) {
      try {
        const outcome = await analyzeFile(file);
        successes += 1;
        if (!firstSuccess) {
          firstSuccess = outcome;
        }
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : "Unknown error";
        failures.push({ file: file.name, message });
      }
      processed += 1;
      setBulkProgress({ completed: processed, total: files.length });
    }

    setBulkPending(false);
    setBulkSummary({ succeeded: successes, failed: failures.length, errors: failures });

    if (firstSuccess) {
      lastFocusedEntryRef.current = null;
      setAnalysis(firstSuccess.result);
      setForm(firstSuccess.result);
      setCurrentEntryId(firstSuccess.entry.id);
      setAnalysisPreview(firstSuccess.previewUrl);
    }

    clearSelectedFiles();
  };

  const handleAnalyze = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentFile) {
      setError("Select a receipt image to analyze.");
      return;
    }

    if (!isKeyVerified) {
      setKeyInput("");
      setKeyError(null);
      setPendingAction("single");
      setShowKeyDialog(true);
      return;
    }

    setPendingAction(null);
    await runSingleAnalysis().catch(() => {
      /* errors already surfaced via setError */
    });
  };

  const handleAnalyzeAll = async () => {
    if (selectedFiles.length === 0) {
      setError("Attach receipt images before running a bulk analysis.");
      return;
    }

    if (!isKeyVerified) {
      setKeyInput("");
      setKeyError(null);
      setPendingAction("bulk");
      setShowKeyDialog(true);
      return;
    }

    setPendingAction(null);
    await runBulkAnalysis();
  };

  const handleHistoryDelete = (id: string) => {
    if (!window.confirm("Delete the selected analysis entry?")) {
      return;
    }
    analyzedPreviewsRef.current.delete(id);
    setHistory((prev) => prev.filter((entry) => entry.id !== id));
    if (currentEntryId === id) {
      lastFocusedEntryRef.current = null;
      setCurrentEntryId(null);
      setAnalysis(null);
      setForm(defaultFields);
      setAnalysisPreview(null);
    }
  };

  const handleLoadEntry = (entry: HistoryEntry) => {
    lastFocusedEntryRef.current = null;
    const storedPreview = analyzedPreviewsRef.current.get(entry.id) ?? null;
    setAnalysis(entry);
    setForm(entry);
    setCurrentEntryId(entry.id);
    setAnalysisPreview(storedPreview);
    clearSelectedFiles();
    setIsKeyVerified(true);
  };

  const handleFieldChange = <K extends keyof ReceiptFields>(key: K, value: ReceiptFields[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveEdits = () => {
    if (!currentEntryId) {
      return;
    }
    setHistory((prev) => prev.map((entry) => (entry.id === currentEntryId ? { ...entry, ...form } : entry)));
    setAnalysis(form);
  };

  const handleVerifyKey = async () => {
    if (!geminiKey) {
      setKeyError("Gemini access code (VITE_GEMINI_ACCESS_KEY) is not configured.");
      return;
    }

    if (keyInput.trim() === geminiKey.trim()) {
      if (typeof window !== "undefined") {
        try {
          const hashed = await hashKey(geminiKey);
          window.sessionStorage.setItem(KEY_VERIFIED_STORAGE_KEY, hashed);
        } catch (storageError) {
          console.warn("Gemini key verification storage failed.", storageError);
        }
      }

      setIsKeyVerified(true);
      setShowKeyDialog(false);
      setKeyInput("");
      setKeyError(null);

      const action = pendingAction;
      setPendingAction(null);
      if (action === "bulk") {
        await runBulkAnalysis();
      } else if (action === "single") {
        await runSingleAnalysis().catch(() => {
          /* already reported */
        });
      }
    } else {
      setKeyError("The code does not match. Please try again.");
    }
  };
  if (!isGeminiConfigured) {
    return (
      <section className="rounded-3xl border border-border/80 bg-card/95 p-6 text-slate-200 shadow-glow sm:p-8">
        <h2 className="text-xl font-semibold text-slate-100">Receipt Analyzer</h2>
        <p className="mt-2 text-sm text-slate-400">
          Gemini API key is missing. Add VITE_GEMINI_KEY to your environment configuration.
        </p>
      </section>
    );
  }

  return (
    <section className="relative rounded-3xl border border-border/80 bg-card/95 p-6 shadow-glow sm:p-8">
      {showKeyDialog && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-slate-950/80 backdrop-blur">
          <div className="w-full max-w-sm rounded-3xl border border-border/60 bg-slate-900/90 p-6 text-slate-200 shadow-subtle">
            <h3 className="text-lg font-semibold text-white">Gemini Access Code</h3>
            <p className="mt-2 text-xs text-slate-400">
              Enter the value of VITE_GEMINI_ACCESS_KEY from your .env file to start the analysis workflow.
            </p>
            <input
              type="password"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              placeholder="VITE_GEMINI_ACCESS_KEY"
              className="mt-4 w-full rounded-xl border border-border/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            {keyError && <p className="mt-2 text-xs text-warning-foreground">{keyError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowKeyDialog(false);
                  setKeyInput("");
                  setKeyError(null);
                  setPendingAction(null);
                }}
                className="inline-flex h-9 items-center justify-center rounded-full border border-border/60 px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-900/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVerifyKey}
                className="inline-flex h-9 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3 text-xs font-semibold text-white shadow-glow"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={cn("flex flex-col gap-6", showKeyDialog ? "blur-sm pointer-events-none select-none" : "")}>
        <header className="space-y-2 text-center sm:text-left">
          <h2 className="text-2xl font-semibold text-slate-100">Receipt Analyzer</h2>
          <p className="text-sm text-slate-400">
            Use Gemini 2.0 Flash to extract receipt summaries. Upload one or more images, analyze them in sequence, and adjust the results directly.
          </p>
          <p className="text-xs text-slate-500">
            Shareable URL: <span className="text-indigo-300">{shortBase}</span>
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)]">
          <form
            className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-slate-900/60 p-6 shadow-subtle"
            onSubmit={handleAnalyze}
          >
            <label className="space-y-2 text-sm font-medium text-slate-200">
              Attach receipt images (multiple files supported)
              <input
                multiple
                type="file"
                accept="image/*"
                onChange={attachFiles}
                className="w-full rounded-2xl border border-border/60 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 shadow-inner file:mr-4 file:rounded-full file:border-0 file:bg-indigo-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </label>

            {selectedFiles.length > 0 && (
              <div className="rounded-2xl border border-border/60 bg-slate-950/60 p-4 text-sm text-slate-200 shadow-inner">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-100">Selected receipts</p>
                  <button
                    type="button"
                    onClick={clearSelectedFiles}
                    className="inline-flex items-center gap-1 rounded-full border border-border/50 px-3 py-1 text-xs text-slate-300 transition hover:bg-slate-800/60"
                  >
                    Clear all
                  </button>
                </div>
                <ul className="mt-3 grid gap-2">
                  {selectedFiles.map((file, index) => {
                    const isActive =
                      currentFile?.name === file.name &&
                      currentFile?.size === file.size &&
                      currentFile?.lastModified === file.lastModified;
                    return (
                      <li
                        key={`${file.name}-${file.lastModified}-${file.size}`}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-slate-900/60 px-3 py-2",
                          isActive ? "border-indigo-400/70" : "",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectActiveFile(index)}
                          className="flex flex-1 flex-col items-start text-left text-xs text-slate-300"
                        >
                          <span className="font-semibold text-slate-100">{file.name}</span>
                          <span className="text-[0.7rem] text-slate-500">
                            {formatBytes(file.size)} | {new Date(file.lastModified).toLocaleDateString()}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveSelectedFile(index)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/60 text-slate-300 transition hover:bg-slate-800/60"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={pending || bulkPending || !currentFile}
                className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-6 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing receipt...
                  </>
                ) : (
                  "Analyze selected"
                )}
              </button>
              <button
                type="button"
                onClick={handleAnalyzeAll}
                disabled={bulkPending || selectedFiles.length === 0}
                className="inline-flex h-11 items-center justify-center rounded-full border border-indigo-400/60 px-6 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Bulk processing... ({bulkProgress.completed}/{bulkProgress.total})
                  </>
                ) : (
                  `Bulk process (${selectedFiles.length})`
                )}
              </button>
            </div>

            {error && (
              <div className="rounded-2xl border border-warning/40 bg-warning/10 px-5 py-4 text-sm font-medium text-warning-foreground shadow-subtle">
                {error}
              </div>
            )}

            {bulkSummary && (
              <div className="rounded-2xl border border-border/60 bg-slate-900/60 px-5 py-4 text-sm text-slate-200 shadow-subtle">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {bulkSummary.failed === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-warning" />
                  )}
                  <span>
                    {bulkSummary.succeeded} succeeded | {bulkSummary.failed} failed
                  </span>
                </div>
                {bulkSummary.failed > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-slate-400">
                    {bulkSummary.errors.map((failure) => (
                      <li key={`${failure.file}-${failure.message}`}>
                        {failure.file}: {failure.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </form>

          <div className="flex flex-col gap-4 lg:gap-6">
            <div className="rounded-3xl border border-border/70 bg-slate-900/60 p-5 shadow-subtle lg:sticky lg:top-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">Receipt preview</h3>
                  <p className="text-xs text-slate-500">
                    {previewSourceHint ??
                      "Attach a receipt or load an entry to keep the image beside the extracted fields."}
                  </p>
                </div>
                {activePreview && (
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.open(activePreview, "_blank", "noopener,noreferrer");
                      }
                    }}
                    className="inline-flex h-8 items-center justify-center rounded-full border border-border/60 px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-900/60"
                  >
                    View full size
                  </button>
                )}
              </div>
              {activePreview ? (
                <>
                  <div className="mt-4 overflow-hidden rounded-2xl border border-border/60 bg-slate-950/60">
                    <div className="flex justify-center bg-slate-950/30">
                      <img
                        src={activePreview}
                        alt={currentFile?.name ?? "receipt preview"}
                        className="h-auto w-full origin-top object-contain transition-all"
                        style={{ maxHeight: `${previewHeight}px` }}
                      />
                    </div>
                  </div>
                  <div className="mt-4 space-y-1">
                    <label className="flex items-center justify-between text-[0.7rem] uppercase tracking-widest text-slate-500">
                      Zoom
                      <span className="font-semibold text-slate-300">
                        {Math.round((previewHeight / 320) * 100)}%
                      </span>
                    </label>
                    <input
                      type="range"
                      min={240}
                      max={720}
                      step={40}
                      value={previewHeight}
                      onChange={(event) => setPreviewHeight(Number(event.target.value))}
                      className="w-full accent-indigo-400"
                    />
                  </div>
                </>
              ) : (
                <p className="mt-4 rounded-2xl border border-dashed border-border/60 bg-slate-950/40 px-4 py-6 text-center text-xs text-slate-400">
                  Attach a receipt or load one from history to preview it here. For older entries, re-attach the image if you need to confirm the details.
                </p>
              )}
            </div>

            {(analysis || currentEntryId) && (
              <div className="rounded-3xl border border-border/70 bg-slate-900/60 p-6 shadow-subtle">
                <h3 className="text-lg font-semibold text-slate-100">Analyzed fields (editable)</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Keep the preview in sight while you review and clean up the extracted values.
                </p>
                {changedFields.size > 0 && (
                  <div className="mt-4 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-3 text-xs text-indigo-100">
                    {changedFields.size} field{changedFields.size > 1 ? "s" : ""} edited. Save to update the history.
                  </div>
                )}
                <div className="mt-4 grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="flex items-center justify-between text-xs uppercase tracking-widest text-slate-400">
                      <span>Usage date</span>
                      {isFieldChanged("usageDate") && (
                        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[0.6rem] font-semibold text-indigo-200">
                          Edited
                        </span>
                      )}
                    </span>
                    <input
                      id="receipt-field-usageDate"
                      value={form.usageDate}
                      onChange={(event) => handleFieldChange("usageDate", event.target.value)}
                      placeholder="e.g. 2025-05-01"
                      className={cn(
                        "rounded-xl border border-border/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
                        isFieldChanged("usageDate")
                          ? "border-indigo-400/70 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(129,140,248,0.35)]"
                          : "",
                      )}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="flex items-center justify-between text-xs uppercase tracking-widest text-slate-400">
                      <span>Item</span>
                      {isFieldChanged("usageItem") && (
                        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[0.6rem] font-semibold text-indigo-200">
                          Edited
                        </span>
                      )}
                    </span>
                    <input
                      id="receipt-field-usageItem"
                      value={form.usageItem}
                      onChange={(event) => handleFieldChange("usageItem", event.target.value)}
                      placeholder="e.g. Latte"
                      className={cn(
                        "rounded-xl border border-border/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
                        isFieldChanged("usageItem")
                          ? "border-indigo-400/70 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(129,140,248,0.35)]"
                          : "",
                      )}
                    />
                  </label>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="flex items-center justify-between text-xs uppercase tracking-widest text-slate-400">
                      <span>Description</span>
                      {isFieldChanged("usageDescription") && (
                        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[0.6rem] font-semibold text-indigo-200">
                          Edited
                        </span>
                      )}
                    </span>
                    <textarea
                      id="receipt-field-usageDescription"
                      value={form.usageDescription}
                      onChange={(event) => handleFieldChange("usageDescription", event.target.value)}
                      placeholder="Add memo or important line items."
                      className={cn(
                        "rounded-xl border border-border/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-indigo-500/40",
                        isFieldChanged("usageDescription")
                          ? "border-indigo-400/70 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(129,140,248,0.35)]"
                          : "",
                      )}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="flex items-center justify-between text-xs uppercase tracking-widest text-slate-400">
                      <span>Merchant</span>
                      {isFieldChanged("usagePlace") && (
                        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[0.6rem] font-semibold text-indigo-200">
                          Edited
                        </span>
                      )}
                    </span>
                    <input
                      id="receipt-field-usagePlace"
                      value={form.usagePlace}
                      onChange={(event) => handleFieldChange("usagePlace", event.target.value)}
                      placeholder="e.g. Kkomentle Cafe"
                      className={cn(
                        "rounded-xl border border-border/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
                        isFieldChanged("usagePlace")
                          ? "border-indigo-400/70 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(129,140,248,0.35)]"
                          : "",
                      )}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="flex items-center justify-between text-xs uppercase tracking-widest text-slate-400">
                      <span>Amount</span>
                      {isFieldChanged("usageAmount") && (
                        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[0.6rem] font-semibold text-indigo-200">
                          Edited
                        </span>
                      )}
                    </span>
                    <input
                      id="receipt-field-usageAmount"
                      value={form.usageAmount}
                      onChange={(event) => handleFieldChange("usageAmount", event.target.value)}
                      placeholder="e.g. 32,000 KRW"
                      className={cn(
                        "rounded-xl border border-border/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
                        isFieldChanged("usageAmount")
                          ? "border-indigo-400/70 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(129,140,248,0.35)]"
                          : "",
                      )}
                    />
                  </label>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="flex items-center justify-between text-xs uppercase tracking-widest text-slate-400">
                      <span>Notes</span>
                      {isFieldChanged("notes") && (
                        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[0.6rem] font-semibold text-indigo-200">
                          Edited
                        </span>
                      )}
                    </span>
                    <textarea
                      id="receipt-field-notes"
                      value={form.notes ?? ""}
                      onChange={(event) => handleFieldChange("notes", event.target.value)}
                      placeholder="Add card info, VAT, or other notes."
                      className={cn(
                        "rounded-xl border border-border/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-indigo-500/40",
                        isFieldChanged("notes")
                          ? "border-indigo-400/70 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(129,140,248,0.35)]"
                          : "",
                      )}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={handleSaveEdits}
                  disabled={!currentEntryId || changedFields.size === 0}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-border/60 bg-transparent px-4 text-xs font-semibold text-slate-200 transition hover:bg-slate-900/60 disabled:pointer-events-none disabled:opacity-60"
                >
                  <Save className="mr-2 h-4 w-4" /> Save changes
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="rounded-3xl border border-border/80 bg-slate-900/60 p-6 shadow-subtle">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-100">Recent analyses</h3>
              <p className="text-xs text-slate-400">
                Every analysis is saved automatically. Export the full history to CSV whenever you like.
              </p>
            </div>
            <button
              type="button"
              disabled={history.length === 0}
              onClick={() => downloadCSV(history)}
              className="inline-flex h-9 items-center justify-center rounded-full border border-border/60 bg-transparent px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-900/60 disabled:pointer-events-none disabled:opacity-60"
            >
              <Download className="mr-2 h-4 w-4" /> Download CSV
            </button>
          </header>

          {initialLoading ? (
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : history.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-border/60 bg-muted/50 px-4 py-6 text-center text-sm text-slate-400">
              No analyses yet. Attach receipts above to get started.
            </p>
          ) : (
            <ul className="mt-6 grid gap-3">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className={cn(
                    "rounded-2xl border border-border/60 bg-slate-950/60 px-4 py-4 text-sm text-slate-200 shadow-subtle",
                    entry.id === currentEntryId ? "ring-2 ring-indigo-400/60" : "",
                  )}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-white">{entry.usageItem || "Unknown item"}</p>
                      <p className="text-xs text-slate-400">
                        {entry.usageDate || "-"} · {entry.usagePlace || "-"} · {entry.usageAmount || "-"}
                      </p>
                      <p className="text-xs text-slate-500">{entry.imageName}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleLoadEntry(entry)}
                        className="inline-flex h-8 items-center justify-center gap-1 text-xs font-semibold text-indigo-200 transition hover:text-indigo-100"
                      >
                        <Edit2 className="h-4 w-4" /> Load
                      </button>
                      <button
                        type="button"
                        onClick={() => handleHistoryDelete(entry.id)}
                        className="inline-flex h-8 items-center justify-center gap-1 text-xs font-semibold text-warning-foreground transition hover:text-warning"
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-1 text-xs text-slate-400 whitespace-pre-wrap">
                    <span>Description: {entry.usageDescription || "-"}</span>
                    <span>Notes: {entry.notes || "-"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

export default ReceiptAnalyzer;




