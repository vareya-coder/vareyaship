# VareyaShip Project Guidelines

## Build Commands
- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm db:generate` - Generate database migrations
- `pnpm db:migrate` - Run database migrations

## Code Style Guidelines

### TypeScript/React
- Use TypeScript for type safety; explicit types for function parameters and returns
- Strict mode enabled; avoid using `any` type
- React functional components with explicit prop interfaces
- Client components marked with "use client" directive

### Import Conventions
- External dependencies first, internal modules second
- Use path aliases with `@/` prefix (e.g., `@/lib/utils`)
- Group related imports together

### Naming Conventions
- Variables/Functions: camelCase
- Components/Types/Interfaces: PascalCase
- Constants: UPPER_CASE or camelCase (scope dependent)

### Error Handling
- Use try/catch for async operations
- Log errors with structured logger (Winston)
- Return appropriate HTTP status codes in API routes
- Custom error handlers for external APIs

### API Routes
- Follow Next.js App Router conventions
- Validate request data
- Service-based architecture for different shipping providers
- Use environment variables with type assertions