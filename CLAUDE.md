# CLAUDE.md — cms-frontend

Đọc `../CLAUDE.md` (workspace) trước. File này chỉ ghi phần riêng của repo CMS.

## Project Overview

SPA quản trị (Vite + React 19 + antd 6 + Tailwind 4), gọi **duy nhất** admin API `:8001/admin/v1` (`VITE_ADMIN_API_URL`). Auth riêng của admin (BE `modules-admin/auth/`): login chỉ nhận role ADMIN, token ký secret admin — không dùng chung token với storefront. Repo tái tạo sạch từ cây CMS cũ, lịch sử git bị bỏ; phase 6 nâng stack + tooling, chưa có màn quản trị nào ngoài Dashboard demo.

## Tech Stack Notes

- **antd 6 là UI kit chính**, Tailwind 4 chỉ utility. antd inject CSS-in-JS không nằm trong `@layer` → `main.tsx` bọc `<StyleProvider layer>` và `index.css` khai `@layer theme, base, antd, components, utilities;` TRƯỚC `@import "tailwindcss"` để utilities thắng style antd. Bỏ StyleProvider là `className` Tailwind trên component antd (bg, padding, margin) không ăn.
- **Tailwind 4 CSS-first**: không có `tailwind.config.js`/postcss; class tuỳ biến → `@theme` trong `index.css`. Lưu ý tên class v4 (`rounded-sm`, `bg-linear-to-r`, `w-16!`), rule `tailwind-v3` của storefront KHÔNG áp cho repo này.
- **react-router 7** import từ package `react-router` (không còn `react-router-dom`), declarative mode: `BrowserRouter` + `useRoutes` trong `router.tsx`, guard là component (`guards/`).
- **Zustand 5** + immer (`useAppStore`: profile kèm `roles`, KHÔNG persist); rule `zustand-v4` của storefront không áp.
- **Axios** `utils/request.ts` = instance duy nhất: Bearer từ cookie, unwrap `response.data`, 401 → refresh single-flight (`_retry`, subscribers có nhánh fail), refresh 401/403 → `clearSession()` + notify, refresh lỗi transient → notify theo `toastError` và giữ phiên; MỌI nhánh reject dạng `ApiError` (`.message`, `.status`); `toastError: false | string` trên config để tắt/đổi notify. Endpoint mới → thêm hàm trong `services/{domain}.ts`, không gọi axios trực tiếp trong component.
- **Lexical pin 0.22.0** (exact) — `components/RichEditor/` là bản copy playground, quyết định phase 6: KHÔNG refactor/nâng version, chỉ sửa để build pass; eslint tắt `react-hooks/{refs,set-state-in-effect,immutability}` + `react-refresh` theo path này. Types React 19 bỏ global `JSX` → file dùng `JSX.Element` phải `import type { JSX } from "react"`.
- **TypeScript giữ 5.9** (typescript-eslint chưa hỗ trợ TS 7). `tsc -b` là lệnh type check (project references `tsconfig.app.json` + `tsconfig.node.json`).

## Conventions

- Alias duy nhất `@/` → `src/` (khai ở cả `vite.config.ts` và `tsconfig.json`); không thêm alias bare (`components/...`).
- Cấu trúc layered: `pages/` (màn) · `layouts/` · `components/` · `services/` (API) · `store/` · `hooks/` · `utils/` · `constants/` · `guards/`. Màn mới → `pages/{Feature}/index.tsx` + route trong `router.tsx` + `PATH.*` trong `constants/paths.ts` + menu `layouts/MainLayout/Sidebar.tsx`.
- Message tiếng Việt cho UI; `constants/validate.ts` chứa message + regex.
- Prettier: double quote (`jsxSingleQuote: true`), no trailing comma, printWidth 100 — lint-staged tự format file staged.
- Test: Vitest + Testing Library, file `*.test.ts(x)` co-located, import tường minh từ `vitest` (không globals). Guard/route test render `MemoryRouter` từ `react-router`.

## Common Commands

```bash
npm run dev          # :3031 (BE admin cần ADMIN_WEB_URL=http://localhost:3031)
npm run typecheck    # tsc -b
npm run lint         # eslint src --max-warnings 0
npm run prettier:fix
npm test             # vitest run
npm run build        # tsc -b && vite build
```

## Gotchas

- **`npm install` với `ignore-scripts=true` toàn cục vẫn đủ**: Vite 8 (rolldown), Tailwind 4 (oxide), lightningcss đều là binary prebuilt qua optional deps, không cần build script. `prepare: husky` không chạy nhưng `.husky/` đã commit sẵn.
- `@lexical/react` 0.22 khai `RefObject<HTMLElement>` kiểu React 18 → chỗ truyền ref vào plugin Lexical dùng `useRef<T>(null!)` (DraggableBlockPlugin). Đừng "sửa" thành `null`.
- ESLint `--report-unused-disable-directives` bật trong script lint: directive thừa = lỗi.
- **`VITE_ADMIN_API_URL` có fallback dev** (`constants/env.ts` → `http://localhost:8001/admin/v1`), build production thiếu biến thì `main.tsx` chặn render. Đừng đọc thẳng `import.meta.env.VITE_ADMIN_API_URL` ở chỗ khác — thiếu biến là axios gọi URL tương đối, dev server trả `index.html` 200 và màn treo spinner không lỗi.
- **`*ExpiresIn` từ BE là mili-giây** (`TimeUtils.convertLifespanToMilliseconds`) — `setCookies(key, value, maxAgeMs)` nhận đúng đơn vị đó; lưu token luôn qua `saveTokens()` (`utils/session.ts`), đừng tự chia đơn vị.
- **Retry sau refresh gửi lại body CŨ** (axios giữ `config.data` đã serialize): endpoint mang token trong body (logout) phải nằm trong `REFRESH_EXCLUDED_PATHS` hoặc đọc token SAU khi refresh.
- **Profile KHÔNG persist** (`useAppStore`): danh tính + roles lấy lại từ `/auth/profile` mỗi lần tải trang. Phiên = cookie (`hasSession()`: còn access HOẶC refresh); `clearSession()` dọn cả cookie lẫn profile, `MainLayout` thấy hết phiên là tự về login.
- **lint-staged chỉ chạy eslint cho `*.{ts,tsx}`**: ESLint flat config cảnh báo "no matching configuration" khi bị truyền file `.css`, với `--max-warnings 0` là pre-commit fail.
- **Cookie key riêng `cmsAccessToken`/`cmsRefreshToken`**: cookie không phân biệt cổng, storefront :3030 dùng `accessToken`/`refreshToken` trên cùng `localhost` — trùng key là phiên 2 app đè nhau.
- `vite.config.ts` bật `strictPort`: cổng 3031 bận thì dev server báo lỗi, KHÔNG tự nhảy cổng (origin lệch là CORS admin chặn).
- Guard dùng `hasSession()` (cookie client-set, không httpOnly); access cookie hết hạn mà refresh còn → request đầu 401 → refresh tự động, không phải lỗi.
- Port 3031 cố định trong `vite.config.ts` (3000 hay bị project khác trên máy dev chiếm); đổi port thì phải đổi `ADMIN_WEB_URL` phía BE (CORS `credentials: true`, không nhận `*`).
