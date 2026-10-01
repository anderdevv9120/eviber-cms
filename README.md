# cms-frontend — Ecommerce CMS

Giao diện quản trị (CMS) cho hệ ecommerce, gọi **admin API** (`backend/` entrypoint admin, `:8001/admin/v1`).

## Tech stack

- React 19 · TypeScript 5.9 · Vite 8 (`@vitejs/plugin-react` 6)
- Ant Design 6 (+ `@ant-design/icons` 6, `@ant-design/cssinjs` StyleProvider layer)
- Tailwind CSS 4 (`@tailwindcss/vite`, CSS-first — không có `tailwind.config`)
- react-router 7 (declarative mode) · Zustand 5 (+ immer) · Axios
- Lexical 0.22 (pin) — RichEditor trong `src/components/RichEditor/`
- ESLint 10 (flat, typescript-eslint, react-hooks 7, react-refresh) · Prettier · Husky + lint-staged · Vitest + Testing Library

## Yêu cầu

- Node ≥ 22.12 (máy dev: 24)
- Backend admin chạy tại `http://localhost:8001` với `ADMIN_WEB_URL` chứa origin CMS (`http://localhost:3031`)

## Bắt đầu

```bash
npm install            # ignore-scripts global vẫn OK: không có native module cần build
# dev không cần file env: VITE_ADMIN_API_URL mặc định http://localhost:8001/admin/v1 (xem .env.example để đổi)
npm run dev            # http://localhost:3031
```

Tài khoản demo (seed của backend): `admin@demo.local` / `Demo@123`.

## Scripts

| Lệnh                                | Việc                                     |
| ----------------------------------- | ---------------------------------------- |
| `npm run dev`                       | dev server :3031                         |
| `npm run build`                     | `tsc -b` + `vite build` → `dist/`        |
| `npm run preview`                   | xem thử bản build                        |
| `npm run typecheck`                 | `tsc -b`                                 |
| `npm run lint` / `lint:fix`         | ESLint `src` (`--max-warnings 0`)        |
| `npm run prettier` / `prettier:fix` | Prettier `src`                           |
| `npm test` / `test:watch`           | Vitest (`src/**/*.test.{ts,tsx}`, jsdom) |

Pre-commit (husky): `scripts/scan-malware.sh --staged` (chặn file config bị cấy mã) → lint-staged (prettier + eslint file staged). Pre-push / pre-merge-commit cũng quét malware.

## Cấu trúc

```
src/
├── @types/          # type dùng chung
├── assets/          # fonts, icon component
├── components/
│   ├── RichEditor/  # Lexical playground copy (pin 0.22) — chỉ sửa để build, không refactor
│   ├── atoms/       # Portal, SvgIcon
│   └── icons/
├── constants/       # paths (PATH.*), validate (message + regex), token keys
├── guards/          # AuthenticatedGuard / PublicGuard (theo hasSession(): còn cookie access hoặc refresh)
├── hooks/
├── layouts/         # AuthLayout, MainLayout (Sidebar + Header), NotFound
├── pages/           # auth/Login, auth/ForgetPassword, Dashboard
├── services/        # gọi API theo domain (auth.ts)
├── store/           # Zustand: useAppStore (profile + roles, không persist)
├── utils/           # request.ts (axios: Bearer + refresh single-flight), session (token + phiên), cookies, notification, getErrorMessage
├── router.tsx       # useRoutes declarative
├── main.tsx         # StyleProvider layer (antd × Tailwind 4)
└── index.css        # @layer order + @import "tailwindcss"
```

## Luồng auth

Login `POST /auth/login` (chỉ tài khoản role ADMIN) → cookie `cmsAccessToken` + `cmsRefreshToken` (js-cookie, hạn theo `*ExpiresIn` mili-giây BE trả, key riêng để không đụng cookie storefront trên cùng localhost) → mọi request gắn Bearer → 401 thì `utils/request.ts` refresh 1 lần (single-flight, request khác chờ) → refresh bị 401/403 thì dọn phiên, `MainLayout` thấy hết phiên tự về login; refresh lỗi tạm thời (mạng, 5xx) thì báo lỗi và giữ phiên. Logout gọi `POST /auth/logout` với refresh token trong body (BE thu hồi đúng phiên đó, không cần access token) rồi xóa cookie. Profile `GET /auth/profile` trả kèm `roles`, không lưu lại giữa các lần tải trang.

## Biến môi trường

| Biến                 | Mô tả                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `VITE_ADMIN_API_URL` | Base URL admin API. Dev mặc định `http://localhost:8001/admin/v1`; build production bắt buộc khai báo |
