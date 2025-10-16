# ����Ʋ �ǿ� ���� ����

�ʼ� ����, ��ũ ����, ������ �νı��� �� ȭ�鿡�� ó���� �� �ִ� ���ο� �����Դϴ�. Google Gemini�� Supabase�� �����ϸ� ���� ���� �÷ο쿡���� ��� Ȱ���� �� �ֽ��ϴ�.

## ���� ���

- **�ʼ� ���� ����**: �ܰ躰 ��Ʈ, �ڸ� ���絵 ���̴� ��Ʈ, ���� ����� ����
- **��ũ �����**: Supabase `short_links` ���̺� ������ ���� ��ũ�� �����ϰ� CSV�� ��������
- **������ �νı�**: Gemini 2.0 Flash Vision �𵨷� �������� �м��� ������ڡ����ó���ݾ� ���� �����ϰ� ����/CSV ��������

## ���� ����

```bash
npm install
npm run dev
```

`http://localhost:5173`���� ��� ������ �ٷ� ����� �� �ֽ��ϴ�.

## ���δ��� ����

```bash
npm run build
```

`dist/` ���͸��� ���� ������ �����Ǹ�, � ���� ȣ���� ȯ�濡���� ������ �� �ֽ��ϴ�.

## GitHub Pages ����

����ҿ��� GitHub Pages �ڵ� ���� ��ũ�÷ΰ� ���ԵǾ� �ֽ��ϴ�. `main` �귣ġ�� push �ϸ� GitHub Actions�� ���带 �����ϰ� `/goGame/` ��η� �������� �����մϴ�. �ʿ� �� Actions �ǿ��� `Deploy Vite app to GitHub Pages` ��ũ�÷θ� ���� ������ ���� �ֽ��ϴ�.

## Supabase ����

1. Supabase SQL Editor���� �Ʒ� ��ũ��Ʈ�� ������ ���̺�� ��å�� �غ��մϴ�.

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

2. `.env` ���Ͽ� �Ʒ� ���� �Է��մϴ�.

```env
VITE_SUPABASE_URL=https://yrrmtcvviactkmxibodu.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## Gemini ����

1. Google AI Studio���� Gemini 2.0 Flash ���� ����� API Ű�� �߱޹޽��ϴ�.
2. `.env` ���Ͽ� `VITE_GEMINI_ACCESS_KEY=<�߱޹��� Ű>`�� �߰��մϴ�.

> **����**: `.env.example` ������ ������ `.env`�� ����� �ʿ��� �׸��� �Ѵ��� Ȯ���� �� �ֽ��ϴ�.

ȯ�� ������ ������ �� `npm run build` �Ǵ� `npm run dev`�� �ٽ� �����ϸ� ��ũ ������ ������ �νıⰡ ���� �����մϴ�.
