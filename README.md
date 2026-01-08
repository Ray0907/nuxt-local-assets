# nuxt-local-assets

Nuxt module for serving user-uploaded files from local storage with authentication, authorization, and audit logging.

## Features

- Serve files from external directories (outside the build)
- Path traversal protection
- Authentication integration
- Custom authorization hooks
- Audit logging for compliance
- HTTP caching (ETag, Last-Modified, Cache-Control)
- Range request support (resume downloads, video streaming)
- Response compression (gzip/brotli)
- MIME type validation
- URL redirects (301/302)
- V8-optimized for performance

## Installation

```bash
pnpm add nuxt-local-assets
```

## Configuration

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-local-assets'],

  localAssets: {
    dirs: [{
      name: 'uploads',
      path: '/data/uploads',      // Production path
      route: '/files',            // URL prefix
      devPath: './dev-uploads',   // Development path
    }],

    auth: {
      required: true,
      authorize: '~/server/utils/authorize',
    },

    audit: {
      enabled: true,
      handler: '~/server/utils/audit',
    },

    security: {
      allowedMimeTypes: ['image/*', 'application/pdf'],
      blockedExtensions: ['.exe', '.sh', '.bat'],
      maxFileSize: '100mb',
    },

    cache: {
      etag: true,
      lastModified: true,
      rules: [
        { match: /\.(jpg|png|gif)$/i, maxAge: 86400 },
        { match: /\.pdf$/i, maxAge: 3600 },
      ],
    },

    compression: {
      enabled: true,
      types: ['text/*', 'application/json', 'application/xml', 'application/javascript'],
      threshold: '1kb',
    },

    rangeRequest: {
      enabled: true,
      maxChunkSize: '10mb',
    },

    redirect: {
      handler: '~/server/utils/redirect',
    },
  },
})
```

## Configuration Reference

### dirs

Directory configurations for serving files.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| name | string | Yes | Unique identifier for this directory |
| path | string | Yes | Absolute path to files in production |
| route | string | Yes | URL prefix (e.g., `/files` serves at `/files/*`) |
| devPath | string | No | Relative path used in development mode |

### auth

Authentication and authorization settings.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| required | boolean | false | Require authenticated user for all requests |
| authorize | string | - | Path to custom authorization function (e.g., `~/server/utils/authorize`) |

### audit

Audit logging configuration.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| enabled | boolean | false | Enable audit logging |
| handler | string | - | Path to audit handler function (e.g., `~/server/utils/audit`) |

### security

Security restrictions.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| allowedMimeTypes | string[] | [] | Whitelist of allowed MIME types. Supports wildcards: `image/*`, `text/*`. Empty = allow all |
| blockedExtensions | string[] | ['.exe', '.sh', '.bat', '.cmd', '.ps1'] | File extensions to block |
| maxFileSize | string | '100mb' | Maximum file size. Supports: `b`, `kb`, `mb`, `gb`, `tb` |

### cache

HTTP caching configuration.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| etag | boolean | true | Generate ETag header for cache validation |
| lastModified | boolean | true | Send Last-Modified header |
| rules | CacheRule[] | [] | Pattern-based Cache-Control rules |

**CacheRule format:**

```typescript
{
  match: RegExp,        // Pattern to match file paths
  maxAge: number,       // Cache-Control max-age in seconds
  mustRevalidate?: boolean,
  immutable?: boolean,
}
```

### compression

Response compression settings.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| enabled | boolean | true | Enable gzip/brotli compression |
| types | string[] | ['text/*', 'application/json', 'application/xml', 'application/javascript'] | MIME types to compress |
| threshold | string | '1kb' | Minimum file size to compress |

### rangeRequest

HTTP Range request support (for video streaming, resume downloads).

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| enabled | boolean | true | Enable Range request support (206 Partial Content) |
| maxChunkSize | string | - | Maximum bytes per range request (e.g., `10mb`) |

### redirect

URL redirect configuration.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| handler | string | - | Path to redirect function (e.g., `~/server/utils/redirect`) |

---

## Authorization Function

```typescript
// server/utils/authorize.ts
import type { FileAccessContext } from 'nuxt-local-assets'

export default function(ctx: FileAccessContext): boolean {
  const { user, filePath } = ctx

  if (!user) return false
  if (user.role === 'admin') return true
  if (filePath.startsWith(`users/${user.id}/`)) return true

  return false
}
```

## Audit Handler

```typescript
// server/utils/audit.ts
import type { AuditLogEntry } from 'nuxt-local-assets'

export default async function(entry: AuditLogEntry): Promise<void> {
  await db.audit_log.create({ data: entry })
}
```

## Redirect Function

Handle URL redirects for moved files, short URLs, or version-based routing:

```typescript
// server/utils/redirect.ts
import type { RedirectContext, RedirectResult } from 'nuxt-local-assets'

export default async function(ctx: RedirectContext): Promise<string | RedirectResult | null> {
  const { filePath, user } = ctx

  // Redirect old file to new location (301 permanent)
  if (filePath === 'old-document.pdf') {
    return {
      url: '/files/documents/new-document.pdf',
      statusCode: 301,
    }
  }

  // Short URL redirect (302 temporary)
  if (filePath.startsWith('s/')) {
    const short_code = filePath.slice(2)
    const resolved = await lookupShortCode(short_code)
    if (resolved) return resolved
  }

  // Return null to continue normal file serving
  return null
}
```

### RedirectContext

```typescript
interface RedirectContext {
  filePath: string           // Relative path within directory
  urlPath: string            // Full URL path
  user: unknown | null       // Authenticated user
  event: H3Event
  dirConfig: LocalAssetsDirConfig
}
```

### RedirectResult

```typescript
interface RedirectResult {
  url: string                // URL to redirect to
  statusCode?: 301 | 302     // HTTP status (default: 302)
}
```

## Types

### FileAccessContext

```typescript
interface FileAccessContext {
  user: unknown | null
  filePath: string        // Relative path within directory
  fullPath: string        // Absolute filesystem path
  fileMeta?: {
    size: number
    mtime: Date
    mimeType: string
  }
  event: H3Event
  dirConfig: LocalAssetsDirConfig
}
```

### AuditLogEntry

```typescript
interface AuditLogEntry {
  timestamp: Date
  idUser: string | null
  action: 'access' | 'denied' | 'not_found' | 'error'
  filePath: string
  ipAddress: string
  userAgent: string
  reason?: string
  dirName: string
}
```

## Security

The module implements multiple layers of security:

- **Path sanitization**: Blocks directory traversal (`../`), null bytes, absolute paths
- **MIME type validation**: Whitelist allowed content types
- **Extension blocking**: Block dangerous file extensions
- **File size limits**: Prevent serving oversized files
- **Path escape detection**: Ensure resolved paths stay within base directory

## Development

```bash
# Install dependencies
pnpm install

# Prepare for development
pnpm dev:prepare

# Run playground
pnpm dev

# Run tests
pnpm test

# Run single test file
npx vitest run test/path.test.ts
```

## Manual Testing

After starting the playground with `pnpm dev`, test features using curl:

```bash
# Basic file access
curl -i http://localhost:3000/files/test.txt

# Test gzip compression
curl -i -H "Accept-Encoding: gzip" http://localhost:3000/files/test.txt

# Test brotli compression
curl -i -H "Accept-Encoding: br" http://localhost:3000/files/test.txt

# Test Range request (partial content)
curl -i -H "Range: bytes=0-100" http://localhost:3000/files/test.txt

# Test 304 Not Modified (use ETag from previous response)
curl -i -H 'If-None-Match: "etag-value"' http://localhost:3000/files/test.txt

# Test blocked extension
curl -i http://localhost:3000/files/test.exe

# Test directory traversal protection
curl -i http://localhost:3000/files/../../../etc/passwd
```

Add test files to `playground/uploads/` directory for testing different MIME types.

## Roadmap

Future enhancements under consideration:

- [ ] HEAD request support
- [ ] Directory listing (optional feature)
- [ ] Content-Disposition header for downloads
- [ ] Rate limiting support
- [ ] Signed URL for temporary access
- [ ] npm publish / CI/CD

## License

MIT
