# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Korean-language web application called "꼬맨틀" (Kkomaentle) that combines three distinct features:
1. **초성 게임 (Choseong Game)**: A word-guessing game where users deduce Korean words from their initial consonants (choseong)
2. **링크 단축기 (Link Shortener)**: A URL shortening service powered by Supabase
3. **영수증 인식기 (Receipt Analyzer)**: OCR-based receipt analysis using Google Gemini Vision API

The app is built with React 19, TypeScript, Vite, and Tailwind CSS, and deployed to GitHub Pages at `/goGame/`.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (runs on http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

## Environment Configuration

Copy `.env.example` to `.env` and configure:

- `VITE_SUPABASE_URL` - Supabase project URL (required for link shortener)
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key (required for link shortener)
- `VITE_GEMINI_KEY` - Google Gemini API key (required for receipt analyzer)
- `VITE_GEMINI_ACCESS_KEY` - Alternative Gemini key

After updating environment variables, restart the dev server or rebuild.

## Architecture

### Application Structure

The app uses a single-page architecture with tab-based navigation managed in [App.tsx](src/App.tsx):
- URL query params control active view: `?s` for shortener, `?view=receipt` for receipt analyzer, default is game
- Three main views are conditionally rendered based on `activeTab` state
- URL state synchronization via `useEffect` ensures shareable links work correctly

### Core Features

**1. Choseong Game ([GameView.tsx](src/views/GameView.tsx))**

The Korean word-guessing game uses advanced Hangul processing:
- **Hangul decomposition**: [hangul.ts](src/lib/hangul.ts) decomposes Korean characters into choseong (initial consonants), jungseong (vowels), and jongseong (final consonants)
- **Similarity scoring**: Levenshtein distance algorithm compares phoneme profiles between guess and answer
- **Two game modes**:
  - Daily mode: deterministic word selection based on date hash
  - Endless mode: random word selection excluding previously solved terms
- **Local storage**: Tracks conquest progress (`kkomaentle-conquered-terms`), player stats (`kkomaentle-stats`), and mode preference (`kkomaentle-mode`)
- **Word data**: Static word list in [words.ts](src/data/words.ts) with term, category, hint, and description

**2. Link Shortener ([LinkShortener.tsx](src/views/LinkShortener.tsx))**

Supabase-backed URL shortening:
- Supabase client: [supabaseClient.ts](src/lib/supabaseClient.ts) initializes the client with `persistSession: false`
- Database table: `short_links` with columns `id`, `code`, `target_url`, `created_at`
- RLS policies: Allow public select, insert, and delete
- CSV export functionality for link management

**3. Receipt Analyzer ([ReceiptAnalyzer.tsx](src/views/ReceiptAnalyzer.tsx))**

Gemini Vision API integration:
- API wrapper: [gemini.ts](src/lib/gemini.ts) sends images to `gemini-2.0-flash:generateContent` endpoint
- Structured extraction: Returns JSON with fields `usageDate`, `usageItem`, `usageDescription`, `usagePlace`, `usageAmount`, `notes`
- Error handling: Detects invalid API keys and provides actionable error messages
- Image handling: Converts uploaded files to base64 with MIME type for API submission

### Hangul Processing ([hangul.ts](src/lib/hangul.ts))

Critical utility for the choseong game:
- `extractChoseong(text)`: Extracts initial consonants from Korean text
- `disassembleHangul(text)`: Fully decomposes each syllable into jamo components
- `createPhonemeProfile(text)`: Returns separate profiles for initial/medial/final consonants plus combined
- `similarityScore(a, b)`: Levenshtein-based similarity metric (0-1 scale)
- Unicode calculations: Uses Hangul syllable block structure (U+AC00 to U+D7A3)

### UI Components

- Reusable card components: [card.tsx](src/components/ui/card.tsx)
- Chart wrapper: [chart.tsx](src/components/ui/chart.tsx) for Recharts integration
- Utility function: [utils.ts](src/lib/utils.ts) provides `cn()` for className merging via `tailwind-merge`

## Deployment

GitHub Actions workflow ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) automatically deploys to GitHub Pages on push to `main`:
- Environment secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEMINI_KEY`, `VITE_GEMINI_ACCESS_KEY`
- Build artifact: `dist/` directory uploaded to Pages
- Base path: `/goGame/` configured in [vite.config.ts](vite.config.ts)

## Supabase Setup

Run this SQL in Supabase SQL Editor:

```sql
create extension if not exists "pgcrypto";

create table if not exists public.short_links (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  target_url text not null,
  created_at timestamptz not null default now()
);

alter table public.short_links enable row level security;
create policy short_links_select on public.short_links for select using (true);
create policy short_links_insert on public.short_links for insert with check (true);
create policy short_links_delete on public.short_links for delete using (true);
```

## TypeScript Configuration

- **Strict mode enabled**: `strict: true` with additional linting rules (`noUnusedLocals`, `noUnusedParameters`, etc.)
- **Bundler module resolution**: Uses Vite's bundler mode with `allowImportingTsExtensions`
- **No emit**: TypeScript only for type checking; Vite handles transpilation
- **React JSX**: `jsx: "react-jsx"` for automatic React 19 JSX transform

## Important Notes

- **Korean text handling**: When working with the game, preserve Korean character integrity - use `extractChoseong` and `disassembleHangul` from [hangul.ts](src/lib/hangul.ts) rather than regex
- **API key security**: Never commit `.env` file; use GitHub repository secrets for deployment
- **Base path awareness**: All routes must account for `/goGame/` base path in production
- **Local storage keys**: Prefix all localStorage keys with `kkomaentle-` to avoid conflicts
- **Tailwind styling**: Use the `cn()` utility from [lib/utils.ts](src/lib/utils.ts) for conditional class merging
