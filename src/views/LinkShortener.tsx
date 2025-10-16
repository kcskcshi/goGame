import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react';

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { cn } from '../lib/utils';

type FeedbackTone = 'info' | 'success' | 'warn';

type ShortUrlEntry = {
  code: string;
  target_url: string;
  created_at: string;
};

const toneStyles: Record<FeedbackTone, string> = {
  info: 'border-indigo-400/40 bg-indigo-500/10 text-indigo-100',
  success: 'border-success/40 bg-success/10 text-success-foreground',
  warn: 'border-warning/40 bg-warning/10 text-warning-foreground',
};

const baseUrl = import.meta.env.BASE_URL ?? '/';
const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

const LinkShortener = () => {
  const [entries, setEntries] = useState<ShortUrlEntry[]>([]);
  const [originalUrl, setOriginalUrl] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: FeedbackTone; message: string; link?: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const shortBase = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return `${window.location.origin}${normalizedBaseUrl}`;
  }, []);

  if (!isSupabaseConfigured || !supabase) {
    return (
      <section className="rounded-3xl border border-border/80 bg-card/95 p-6 text-slate-200 shadow-glow sm:p-8">
        <h2 className="text-xl font-semibold text-slate-100">Link Shortener</h2>
        <p className="mt-2 text-sm text-slate-400">
          Supabase environment variables are missing. Please configure `VITE_SUPABASE_URL` and
          `VITE_SUPABASE_ANON_KEY` in your `.env` file to enable the URL shortener.
        </p>
      </section>
    );
  }

  const client = supabase;

  const fetchEntries = useCallback(async () => {
    const { data, error } = await client
      .from('short_links')
      .select('code,target_url,created_at')
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      setFeedback({ tone: 'warn', message: 'Failed to load saved links. Please try again later.' });
      return;
    }
    setEntries(data ?? []);
  }, [client]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shortCode = params.get('s');

    const handleRedirect = async () => {
      if (!shortCode) {
        return;
      }
      const { data, error } = await client
        .from('short_links')
        .select('target_url')
        .eq('code', shortCode)
        .maybeSingle();
      if (error) {
        console.error(error);
        setFeedback({ tone: 'warn', message: 'Unable to resolve the short link. Please try again later.' });
        return;
      }
      if (data?.target_url) {
        window.location.replace(data.target_url);
      } else {
        setFeedback({ tone: 'warn', message: 'Short link not found.' });
      }
    };

    const init = async () => {
      await Promise.all([fetchEntries(), handleRedirect()]);
      setInitialLoading(false);
    };

    void init();
  }, [client, fetchEntries]);

  const sanitizeCustomCode = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-_]/g, '')
      .slice(0, 24);

  const generateRandomCode = (length = 6) => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i += 1) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleShorten = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    let url = originalUrl.trim();
    if (!url) {
      setFeedback({ tone: 'warn', message: 'Please enter a URL to shorten.' });
      return;
    }

    try {
      url = new URL(url).toString();
    } catch {
      setFeedback({ tone: 'warn', message: 'Please enter a valid URL starting with http:// or https://.' });
      return;
    }

    let desiredCode = customCode ? sanitizeCustomCode(customCode) : '';
    if (customCode && !desiredCode) {
      setFeedback({ tone: 'warn', message: 'Only English letters, numbers, hyphen and underscore are allowed.' });
      return;
    }

    setPending(true);

    try {
      if (!desiredCode) {
        do {
          desiredCode = generateRandomCode();
          const { data } = await client.from('short_links').select('code').eq('code', desiredCode).maybeSingle();
          if (!data) {
            break;
          }
        } while (true);
      } else {
        const { data } = await client.from('short_links').select('code').eq('code', desiredCode).maybeSingle();
        if (data) {
          setFeedback({ tone: 'warn', message: 'This code is already in use. Please choose another.' });
          return;
        }
      }

      const { data: existing } = await client
        .from('short_links')
        .select('code')
        .eq('target_url', url)
        .maybeSingle();

      if (existing && !customCode) {
        const link = `${shortBase}?s=${existing.code}`;
        setFeedback({ tone: 'info', message: 'This URL was already shortened. Reusing existing code.', link });
        setOriginalUrl('');
        setCustomCode('');
        return;
      }

      const { data, error } = await client
        .from('short_links')
        .insert({ code: desiredCode, target_url: url })
        .select('code,target_url,created_at')
        .single();

      if (error) {
        console.error(error);
        setFeedback({ tone: 'warn', message: 'Failed to create short link. Please try again later.' });
        return;
      }

      setFeedback({
        tone: 'success',
        message: 'Short link created successfully.',
        link: `${shortBase}?s=${data.code}`,
      });
      setOriginalUrl('');
      setCustomCode('');
      setEntries((prev) => [data, ...prev]);
    } finally {
      setPending(false);
    }
  };

  const handleCopy = async (code: string) => {
    if (typeof navigator === 'undefined') {
      return;
    }
    const shortUrl = `${shortBase}?s=${code}`;
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (error) {
      console.error(error);
      setFeedback({ tone: 'warn', message: 'Copy failed. Please copy manually.', link: shortUrl });
    }
  };

  const handleRemove = async (code: string) => {
    const confirmed = window.confirm('Delete this short link?');
    if (!confirmed) {
      return;
    }

    const { error } = await client.from('short_links').delete().eq('code', code);
    if (error) {
      console.error(error);
      setFeedback({ tone: 'warn', message: 'Failed to delete link. Please try again.' });
      return;
    }

    setEntries((prev) => prev.filter((entry) => entry.code !== code));
  };

  return (
    <section className="rounded-3xl border border-border/80 bg-card/95 p-6 shadow-glow sm:p-8">
      <div className="flex flex-col gap-4">
        <header className="space-y-2 text-center sm:text-left">
          <h2 className="text-2xl font-semibold text-slate-100">Link Shortener</h2>
          <p className="text-sm text-slate-400">
            Create compact links powered by Supabase so the same code works across every device.
          </p>
        </header>

        <form
          className="grid gap-4 rounded-3xl border border-border/70 bg-slate-900/60 p-6 shadow-subtle"
          onSubmit={handleShorten}
        >
          <label className="space-y-2 text-sm font-medium text-slate-200">
            Original URL
            <input
              type="url"
              placeholder="https://example.com/article"
              value={originalUrl}
              onChange={(event) => setOriginalUrl(event.target.value)}
              className="w-full rounded-2xl border border-border/60 bg-slate-950/60 px-4 py-3 text-base text-slate-100 shadow-inner transition placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              required
            />
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-200">
            Custom code (optional)
            <input
              type="text"
              placeholder="promo-2025"
              value={customCode}
              onChange={(event) => setCustomCode(event.target.value)}
              className="w-full rounded-2xl border border-border/60 bg-slate-950/60 px-4 py-3 text-base text-slate-100 shadow-inner transition placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <p className="text-xs text-slate-400">Up to 24 characters. Letters, numbers, hyphen, underscore only.</p>
          </label>

          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-6 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create short link'
            )}
          </button>
        </form>

        {feedback && (
          <div
            className={cn(
              'rounded-2xl border px-5 py-4 text-sm font-medium shadow-subtle transition',
              toneStyles[feedback.tone],
            )}
          >
            <p>{feedback.message}</p>
            {feedback.link && (
              <p className="mt-2 text-xs text-slate-100">
                <button
                  type="button"
                  onClick={() => handleCopy(feedback.link!.split('=').pop() ?? '')}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-slate-900/40 px-2 py-1 text-xs text-slate-100 transition hover:bg-slate-900/60"
                >
                  {feedback.link}
                  <Copy className="h-3 w-3" />
                </button>
              </p>
            )}
          </div>
        )}

        <div className="rounded-3xl border border-border/80 bg-slate-900/60 p-6 shadow-subtle">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold text-slate-100">Saved short links</p>
              <p className="text-xs text-slate-400">
                {entries.length > 0
                  ? 'Copy with one click or open in a new tab.'
                  : 'No links yet. Create your first short link above.'}
              </p>
            </div>
          </header>

          {initialLoading ? (
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : (
            entries.length > 0 && (
              <ul className="mt-4 grid gap-3">
                {entries.map((entry) => {
                  const shortUrl = `${shortBase}?s=${entry.code}`;
                  const isCopied = copiedCode === entry.code;
                  return (
                    <li
                      key={entry.code}
                      className="rounded-2xl border border-border/60 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 shadow-subtle"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <p className="font-semibold text-white">{shortUrl}</p>
                          <p className="text-xs text-slate-400">¡æ {entry.target_url}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopy(entry.code)}
                            className={cn(
                              'inline-flex h-9 items-center justify-center rounded-full border px-3 text-xs font-semibold transition',
                              isCopied
                                ? 'border-success/40 bg-success/10 text-success-foreground'
                                : 'border-border/60 bg-transparent text-slate-200 hover:bg-slate-900/60',
                            )}
                          >
                            {isCopied ? (
                              <>
                                Copied
                                <Check className="ml-1 h-3.5 w-3.5" />
                              </>
                            ) : (
                              <>
                                Copy
                                <Copy className="ml-1 h-3.5 w-3.5" />
                              </>
                            )}
                          </button>
                          <a
                            className="inline-flex h-9 items-center justify-center rounded-full border border-border/60 bg-transparent px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-900/60"
                            href={entry.target_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open
                            <ExternalLink className="ml-1 h-3.5 w-3.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => handleRemove(entry.code)}
                            className="inline-flex h-9 items-center justify-center rounded-full border border-warning/40 bg-transparent px-3 text-xs font-semibold text-warning-foreground transition hover:bg-warning/10"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </div>
      </div>
    </section>
  );
};

export default LinkShortener;
