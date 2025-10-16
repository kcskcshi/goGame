# 꼬맨틀 실용 도구 모음

초성 퀴즈, 링크 단축, 영수증 인식까지 한 화면에서 처리할 수 있는 올인원 웹앱입니다. Google Gemini와 Supabase를 연동하면 실제 업무 플로우에서도 즉시 활용할 수 있습니다.

## 제공 기능

- **초성 유추 게임**: 단계별 힌트, 자모별 유사도 레이더 차트, 로컬 진행률 추적
- **링크 단축기**: Supabase `short_links` 테이블에 저장해 팀과 링크를 공유하고 CSV로 내보내기
- **영수증 인식기**: Gemini 2.0 Flash Vision 모델로 영수증을 분석해 사용일자·사용처·금액 등을 추출하고 편집/CSV 내보내기

## 빠른 시작

```bash
npm install
npm run dev
```

`http://localhost:5173`에서 모든 도구를 바로 사용할 수 있습니다.

## 프로덕션 빌드

```bash
npm run build
```

`dist/` 디렉터리에 정적 파일이 생성되며, 어떤 정적 호스팅 환경에서도 배포할 수 있습니다.

## GitHub Pages 배포

저장소에는 GitHub Pages 자동 배포 워크플로가 포함되어 있습니다. `main` 브랜치로 push 하면 GitHub Actions가 빌드를 실행하고 `/goGame/` 경로로 페이지를 갱신합니다. 필요 시 Actions 탭에서 `Deploy Vite app to GitHub Pages` 워크플로를 직접 실행할 수도 있습니다.

## Supabase 설정

1. Supabase SQL Editor에서 아래 스크립트를 실행해 테이블과 정책을 준비합니다.

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

2. `.env` 파일에 아래 값을 입력합니다.

```env
VITE_SUPABASE_URL=https://yrrmtcvviactkmxibodu.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## Gemini 설정

1. Google AI Studio에서 Gemini 2.0 Flash 모델을 사용할 API 키를 발급받습니다.
2. `.env` 파일에 `VITE_GEMINI_ACCESS_KEY=<발급받은 키>`를 추가합니다.

> **참고**: `.env.example` 파일을 복사해 `.env`를 만들면 필요한 항목을 한눈에 확인할 수 있습니다.

환경 변수를 설정한 뒤 `npm run build` 또는 `npm run dev`를 다시 실행하면 링크 단축기와 영수증 인식기가 정상 동작합니다.
