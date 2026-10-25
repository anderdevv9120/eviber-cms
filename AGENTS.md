# CLAUDE.md — cms-frontend

Đọc `../CLAUDE.md` (workspace) trước. File này chỉ ghi phần riêng của repo CMS.

## Project Overview

SPA quản trị (Vite + React 19 + antd 6 + Tailwind 4), gọi **duy nhất** admin API `:8005/admin/v1` (`VITE_ADMIN_API_URL`). Auth riêng của admin (BE `modules-admin/auth/`): login chỉ nhận role ADMIN, token ký secret admin — không dùng chung token với storefront. Repo tái tạo sạch từ cây CMS cũ, lịch sử git bị bỏ; phase 6 nâng stack + tooling, chưa có màn quản trị nào ngoài Dashboard demo.

## Tech Stack Notes

- **antd 6 là UI kit chính**, Tailwind 4 chỉ utility. antd inject CSS-in-JS không nằm trong `@layer` → `main.tsx` bọc `<StyleProvider layer>` và `index.css` khai `@layer theme, base, antd, components, utilities;` TRƯỚC `@import "tailwindcss"` để utilities thắng style antd. Bỏ StyleProvider là `className` Tailwind trên component antd (bg, padding, margin) không ăn.
- **Tailwind 4 CSS-first**: không có `tailwind.config.js`/postcss; class tuỳ biến → `@theme` trong `index.css`. Lưu ý tên class v4 (`rounded-sm`, `bg-linear-to-r`, `w-16!`), rule `tailwind-v3` của storefront KHÔNG áp cho repo này.
- **react-router 7** import từ package `react-router` (không còn `react-router-dom`), data router: `router.tsx` export `routes: RouteObject[]`; `App.tsx` sở hữu `createBrowserRouter` ổn định và render `RouterProvider`. Guard vẫn là component (`guards/`); data router hỗ trợ `useBlocker` cho luồng chưa lưu.
- **Zustand 5** + immer (`useAppStore`: profile kèm `roles`, KHÔNG persist; `useThemeStore`: chế độ sáng/tối, lưu `localStorage` key `cms.themeMode`, chưa lưu thì theo `prefers-color-scheme`); rule `zustand-v4` của storefront không áp.
- **Theme = `constants/theme.ts`** (`PALETTE` light/dark + `getAppTheme(mode)` → token + component token); `App.tsx` bọc `ConfigProvider` (theme + locale `viVN`) quanh router. Đổi màu/kích thước shell, table, menu → sửa token ở đây, không hardcode hex trong component. Brand (`layouts/Brand.tsx`) vẽ SVG inline cùng hình `public/favicon.svg` — đổi logo phải sửa cả hai.
- **Axios** `utils/request.ts` = instance duy nhất: Bearer từ cookie, unwrap `response.data`, 401 → refresh single-flight (`_retry`, subscribers có nhánh fail), refresh 401/403 → `clearSession()` + notify, refresh lỗi transient → notify theo `toastError` và giữ phiên; MỌI nhánh reject dạng `ApiError` (`.message`, `.status`); `toastError: false | string` trên config để tắt/đổi notify. Endpoint mới → thêm hàm trong `services/{domain}.ts`, không gọi axios trực tiếp trong component.
- **Lexical pin 0.22.0** (exact) — `components/RichEditor/` là bản copy playground, quyết định phase 6: KHÔNG refactor/nâng version, chỉ sửa để build pass; oxlint (`.oxlintrc.json` override) tắt `react/{refs,set-state-in-effect,immutability,only-export-components}` theo path này. Types React 19 bỏ global `JSX` → file dùng `JSX.Element` phải `import type { JSX } from "react"`.
- **TypeScript giữ 5.9** (lý do cũ là typescript-eslint — đã bỏ khi chuyển oxlint, nâng TS 7 chưa làm). `tsc -b` là lệnh type check (project references `tsconfig.app.json` + `tsconfig.node.json`).

## Conventions

- **CMS không yêu cầu responsive.** Ưu tiên chức năng, luồng nghiệp vụ và xử lý lỗi; không thêm công việc responsive hoặc kiểm tra bố cục mobile cho CMS trừ khi người dùng yêu cầu rõ ràng.
- Alias duy nhất `@/` → `src/` (khai ở cả `vite.config.ts` và `tsconfig.json`); không thêm alias bare (`components/...`).
- Cấu trúc layered: `pages/` (màn) · `layouts/` · `components/` · `services/` (API) · `store/` · `hooks/` · `utils/` · `constants/` · `guards/`. Màn mới → `pages/{Feature}/index.tsx` + route trong `router.tsx` + `PATH.*` trong `constants/paths.ts` + item trong `MENU_SECTIONS` (`layouts/MainLayout/menu.tsx`, key = path danh sách; route con tự sáng theo mục cha nhờ so tiền tố) + crumb trong `STATIC_BREADCRUMBS` (`layouts/MainLayout/index.tsx`, thiếu thì màn không có breadcrumb). Route màn mới mang tiền tố section (`/catalog/`, `/content/`, `/settings/`); `/products`, `/inventory`, `/policies` là ngoại lệ có trước, giữ nguyên để không gãy bookmark. Thư mục `pages/` đặt theo tên màn, không theo key `PATH` (`pages/StoreInfo` ↔ `PATH.CONTENT_INFO`).
- Message tiếng Việt cho UI; `constants/validate.ts` chứa message + regex.
- Prettier: double quote (`jsxSingleQuote: true`), no trailing comma, printWidth 100 — lint-staged tự format file staged.
- Test: Vitest + Testing Library, file `*.test.ts(x)` co-located, import tường minh từ `vitest` (không globals). Guard test có thể dùng `MemoryRouter`; route/navigation test dùng `createMemoryRouter` + `RouterProvider` từ `react-router` với các route objects thực tế.

## Common Commands

```bash
npm run dev          # :3031 (BE admin cần ADMIN_WEB_URL=http://localhost:3031)
npm run typecheck    # tsc -b
npm run lint         # oxlint src --max-warnings 0
npm run prettier:fix
npm test             # vitest run
npm run build        # tsc -b && vite build
```

## Gotchas

- **`npm install` với `ignore-scripts=true` toàn cục vẫn đủ**: Vite 8 (rolldown), Tailwind 4 (oxide), lightningcss đều là binary prebuilt qua optional deps, không cần build script. `prepare: husky` không chạy nhưng `.husky/` đã commit sẵn.
- `@lexical/react` 0.22 khai `RefObject<HTMLElement>` kiểu React 18 → chỗ truyền ref vào plugin Lexical dùng `useRef<T>(null!)` (DraggableBlockPlugin). Đừng "sửa" thành `null`.
- oxlint `--report-unused-disable-directives` bật trong script lint: directive thừa = lỗi.
- **`VITE_ADMIN_API_URL` có fallback dev** (`constants/env.ts` → `http://localhost:8005/admin/v1`), build production thiếu biến thì `main.tsx` chặn render. Đừng đọc thẳng `import.meta.env.VITE_ADMIN_API_URL` ở chỗ khác — thiếu biến là axios gọi URL tương đối, dev server trả `index.html` 200 và màn treo spinner không lỗi.
- **`*ExpiresIn` từ BE là mili-giây** (`TimeUtils.convertLifespanToMilliseconds`) — `setCookies(key, value, maxAgeMs)` nhận đúng đơn vị đó; lưu token luôn qua `saveTokens()` (`utils/session.ts`), đừng tự chia đơn vị.
- **Retry sau refresh gửi lại body CŨ** (axios giữ `config.data` đã serialize): endpoint mang token trong body (logout) phải nằm trong `REFRESH_EXCLUDED_PATHS` hoặc đọc token SAU khi refresh.
- **Profile KHÔNG persist** (`useAppStore`): danh tính + roles lấy lại từ `/auth/profile` mỗi lần tải trang. Phiên = cookie (`hasSession()`: còn access HOẶC refresh); `clearSession()` dọn cả cookie lẫn profile, `MainLayout` thấy hết phiên là tự về login.
- **lint-staged chỉ chạy oxlint cho `*.{ts,tsx}`**: oxlint nhận toàn file không lint được (`.css`) hoặc bị ignore thì exit 1 "No files found" — lint-staged thêm `--no-error-on-unmatched-pattern`.
- **Cookie key riêng `cmsAccessToken`/`cmsRefreshToken`**: cookie không phân biệt cổng, storefront :3030 dùng `accessToken`/`refreshToken` trên cùng `localhost` — trùng key là phiên 2 app đè nhau.
- `vite.config.ts` bật `strictPort`: cổng 3031 bận thì dev server báo lỗi, KHÔNG tự nhảy cổng (origin lệch là CORS admin chặn).
- Guard dùng `hasSession()` (cookie client-set, không httpOnly); access cookie hết hạn mà refresh còn → request đầu 401 → refresh tự động, không phải lỗi.
- **`var(--ant-*)` chỉ có giá trị BÊN TRONG root của component antd** (antd 6 cssVar gắn theo component): class Tailwind `bg-(--ant-…)` trên `div`/`main` thường ra rỗng → nền/màu ngoài component antd lấy từ `theme.useToken()` qua `style`.
- **Toast `utils/notification.ts` là static API**, render ngoài cây React → chỉ đọc theme global; `App.tsx` gọi `ConfigProvider.config({ theme })` mỗi lần đổi mode. Cảnh báo dev "Static function can not consume context" là của cách gọi static, không phải lỗi theme. Modal cần theme/context thì dùng `App.useApp()` (như `useUnsavedOrderWarning`).
- **Vùng cuộn là `Content` của `MainLayout`**, không phải `window` (panel cao cố định `100vh-16px`, sidebar sticky): code cần bắt cuộn/`scrollTo` phải nhắm vào container đó; `hooks/useScroll.tsx` (nghe `window`) hiện không ai dùng và sẽ không chạy nếu gắn vào màn trong shell.
- antd `Avatar` có `size` số → inline `fontSize` đè className; chỉnh cỡ chữ qua prop `style`.
- Port 3031 cố định trong `vite.config.ts` (3000 hay bị project khác trên máy dev chiếm); đổi port thì phải đổi `ADMIN_WEB_URL` phía BE (CORS `credentials: true`, không nhận `*`).
- **antd Form trong khối mount/unmount có điều kiện** (ô nhập mở bằng nút, Form unmount khi tải lại): rc-form `preserve` mặc định giữ store qua unmount và chỉ áp `initialValue`/`initialValues` khi store trống → giá trị cũ dính lại khi mount lại. Field có điều kiện → `preserve={false}`; giá trị nạp từ server → `form.setFieldsValue` trong `useEffect` SAU khi Form mount (gọi lúc Form chưa mount bị cảnh báo "useForm is not connected"); `clearOnDestroy` KHÔNG dùng được vì StrictMode unmount/mount lại làm store trống (pattern tại `pages/PaymentSettings`).
- **antd `Button` prop `disabled={false}` ghi đè `disabled` của Form cha** (`customDisabled ?? contextDisabled`): nút trong Form muốn vừa theo Form vừa theo điều kiện riêng phải gộp điều kiện (`disabled={testing || saving}`), không chỉ truyền điều kiện riêng.
- **BE trả `errors` là STRING mã lỗi (`sys000xx`)**, `toApiError` trong `utils/request.ts` chỉ giữ `errors` dạng object → `ApiError.errors` luôn `undefined`; phân nhánh lỗi hiện chỉ theo `status` (409, 429, 400) cho tới khi `toApiError` nhận string thành `{ code }`.
