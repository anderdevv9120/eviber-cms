# Ecommerce CMS Frontend

A content management system for e-commerce platforms built with React, TypeScript, and Vite.

## Tech Stack

- **Frontend Framework:** React 18.3.1
- **Language:** TypeScript 5.6.3
- **Build Tool:** Vite 5.4.10
- **CSS Framework:** Tailwind CSS 3.4.14
- **UI Library:** Ant Design 5.21.6
- **State Management:** Zustand 5.0.2
- **Routing:** React Router DOM 6.28.0
- **HTTP Client:** Axios 1.7.7
- **Rich Text Editor:** Lexical 0.22.0
- **Code Quality:** ESLint, Prettier, Husky

## Prerequisites

- Node.js >= 16.0.0
- npm or yarn

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd Ecommerce-FE-CMS
```

### 2. Install dependencies

```bash
npm install
# or
yarn install
```

### 3. Environment configuration

Create a `.env` file in the root directory and add the following environment variables:

```env
VITE_API_URL=http://localhost:8000/api
```

### 4. Run the development server

```bash
npm run dev
# or
yarn dev
```

The application will automatically open at `http://localhost:3000`

## Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build the app for production
- `npm run preview` - Preview the production build
- `npm run lint` - Run ESLint to check for errors
- `npm run lint:fix` - Auto-fix ESLint errors
- `npm run prettier` - Check code formatting
- `npm run prettier:fix` - Auto-format code

## Project Structure

```
src/
├── @types/          # TypeScript type definitions
├── assets/          # Static assets (fonts, icons)
├── components/      # Reusable components
│   ├── RichEditor/  # Rich text editor component
│   ├── atoms/       # Atomic components
│   └── icons/       # Icon components
├── constants/       # Constants and configs
├── guards/          # Route guards
├── hooks/           # Custom React hooks
├── layouts/         # Layout components
│   ├── AuthLayout   # Layout for authentication pages
│   └── MainLayout/  # Main app layout with sidebar and header
├── pages/           # Page components
│   ├── Dashboard/   # Dashboard page
│   └── auth/        # Authentication pages (Login, Forgot Password)
├── router.tsx       # Route configuration
├── services/        # API services
├── store/           # Zustand store
└── utils/           # Utility functions
```

## Key Features

- **Authentication**: JWT-based login and session management
- **Dashboard**: System overview page
- **Rich Text Editor**: Content editing with Lexical editor
- **Theme Support**: Light/dark theme switching
- **Responsive Design**: Mobile-first responsive interface
- **Route Guards**: Protected routes with authentication

## Development Guidelines

### Code Style

- Use TypeScript for type safety
- Follow configured ESLint and Prettier rules
- Use functional components with React Hooks
- Component names should use PascalCase
- File names should match component names

### Git Workflow

- Create new branches from `develop` for each feature/fix
- Branch naming: `feat/feature-name` or `fix/bug-name`  
- Write clear, descriptive commit messages
- Create Pull Requests to the `develop` branch

### API Integration

- Use the configured axios instance in `src/utils/request.ts`
- Automatic refresh token handling when access token expires
- Centralized error handling

### Path Aliases

The project uses path aliases for cleaner imports:

- `@/` - src directory
- `components` - src/components
- `constants` - src/constants
- `hooks` - src/hooks
- `layouts` - src/layouts
- `assets` - src/assets
- `utils` - src/utils
- `store` - src/store

## Building for Production

```bash
npm run build
```

The build output will be generated in the `dist/` directory. You can deploy this directory to any static hosting service (Vercel, Netlify, AWS S3, etc.)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | Required |

## Troubleshooting

### Dependencies installation issues
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again

### CORS errors when calling API
- Check `VITE_API_URL` in `.env` file
- Ensure backend has configured CORS for frontend domain

### TypeScript errors
- Run `npm run lint` to see detailed errors
- Check TypeScript version compatibility

### Build failures
- Clear build cache: `rm -rf dist`
- Check for TypeScript errors: `npm run build`
- Verify all environment variables are set

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

[MIT License](LICENSE)