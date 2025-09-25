# CSRF Prevention

Mercurius includes built-in Cross-Site Request Forgery (CSRF) prevention to protect your GraphQL endpoints from malicious requests.

## What is CSRF?

[Cross-Site Request Forgery (CSRF)](https://owasp.org/www-community/attacks/csrf) attacks exploit the fact that browsers automatically include cookies and other credentials when making requests to websites. An attacker can create a malicious website that makes requests to your GraphQL server using the victim's credentials.

CSRF attacks are particularly dangerous for "simple" requests that don't trigger a CORS preflight check. These attacks can:
- Execute mutations using an authenticated user's credentials
- Extract timing information from queries (XS-Search attacks)
- Abuse any GraphQL operations that have side effects

## How CSRF Prevention Works

Mercurius protects against CSRF attacks by ensuring that GraphQL requests do **not** qualify as “simple” requests under the [CORS specification](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#simple_requests).

A request is considered safe if **any** of the following conditions are met:

### 1. Content-Type Header

Requests that include a `Content-Type` header specifying a type **other than**:

* `text/plain`
* `application/x-www-form-urlencoded`
* `multipart/form-data`

will trigger a **preflight `OPTIONS` request**, meaning the request cannot be considered “simple.”

By default, Mercurius allows the following `Content-Type` headers:

* `application/json` (recommended and most common)
* `application/graphql`

Note charset and other params are ignored

### 2. Required Headers

Requests that include a **custom header** also require a **preflight `OPTIONS` request**, preventing them from being “simple.”

By default, Mercurius checks for one of the following headers:

* `X-Mercurius-Operation-Name`
* `Mercurius-Require-Preflight`

## Configuration

### Enabling CSRF Prevention

CSRF prevention is **disabled by default**. Enable it with:

```javascript
const app = Fastify()
await app.register(mercurius, {
  schema,
  resolvers,
  csrfPrevention: true // Enable with default settings
})
```

Default required headers (case insensitive):
- `x-mercurius-operation-name` - Custom header for identifying GraphQL operations
- `mercurius-require-preflight` - General-purpose header for forcing preflight

### CORS Configuration

While not strictly necessary, CORS should be configured appropriately:

```javascript
await app.register(require('@fastify/cors'), {
  origin: ['https://your-frontend.com']
})

await app.register(mercurius, {
  schema,
  resolvers,
  csrfPrevention: true
})
```

## Advanced Configuration

### Custom Required Headers

Configure which headers are accepted to bypass CSRF protection (these replace the default headers):

```javascript
await app.register(mercurius, {
  schema,
  resolvers,
  csrfPrevention: {
    contentTypes: ['application/json', 'application/graphql', 'application/vnd.api+json'],
    requiredHeaders: ['Authorization', 'X-Custom-Header', 'X-Another-Header']
  }
})
```

### Disabling CSRF Prevention

```javascript
await app.register(mercurius, {
  schema,
  resolvers,
  csrfPrevention: false
})
```

### Enabling File Upload

File uploads require a `multipart/form-data` request. To enable CSRF protection for file uploads, the request must include both:

* `Content-Type: multipart/form-data`
* A custom header

```javascript
import mercuriusUpload from 'mercurius-upload';
import mercurius from 'mercurius';

await app.register(mercuriusUpload);
await app.register(mercurius, {
  schema,
  resolvers,
  csrfPrevention: {
    contentTypes: ['application/json', 'multipart/form-data'],
    requiredHeaders: ['X-Custom-Header']
  }
});
```

This configuration ensures that file uploads trigger a preflight `OPTIONS` request, preventing them from being treated as "simple" requests and keeping your API safe from CSRF attacks.

## Client Integration

For custom GraphQL clients, ensure your requests include one of the following:

### Option 1: Use application/json content-type (recommended)
```javascript
fetch('/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query: '{ hello }' })
})
```

### Option 2: Include a required header
```javascript
fetch('/graphql?query={hello}', {
  method: 'GET',
  headers: {
    'mercurius-require-preflight': 'true'
  }
})
```

## Complete Examples

### Basic Server Setup

```javascript
const Fastify = require('fastify')
const mercurius = require('mercurius')

const app = Fastify({ logger: true })

const schema = `
  type Query {
    hello: String
    users: [User]
  }
  
  type Mutation {
    createUser(name: String!): User
  }
  
  type User {
    id: ID!
    name: String!
  }
`

const resolvers = {
  Query: {
    hello: () => 'Hello World',
    users: () => [{ id: '1', name: 'John' }]
  },
  Mutation: {
    createUser: (_, { name }) => ({ id: Date.now().toString(), name })
  }
}

// Register CORS (recommended)
await app.register(require('@fastify/cors'), {
  origin: ['https://your-frontend.com'],
  credentials: true
})

// Register Mercurius with CSRF protection
await app.register(mercurius, {
  schema,
  resolvers,
  csrfPrevention: true, // Enable CSRF protection
})

await app.listen({ port: 4000, host: '0.0.0.0' })
console.log('GraphQL server running on http://localhost:4000/graphql')
```

### Frontend Client Example

```javascript
// React/Frontend example with proper headers
const client = {
  query: async (query, variables = {}) => {
    const response = await fetch('/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Optional: Add custom identification
        'x-mercurius-operation-name': 'ClientQuery'
      },
      body: JSON.stringify({ query, variables })
    })
    
    if (!response.ok) {
      throw new Error(`GraphQL Error: ${response.status}`)
    }
    
    return response.json()
  }
}

// Usage
try {
  const result = await client.query('{ hello }')
  console.log(result.data.hello)
} catch (error) {
  console.error('CSRF or other error:', error)
}
```

## Testing CSRF Prevention

### Testing Blocked Requests

```javascript
// This request will be blocked (400 status)
const response = await fetch('/graphql?query={hello}', {
  method: 'GET'
  // No required headers or valid content-type
})
console.log(response.status) // 400
```

### Testing Allowed Requests

```javascript
// This request will succeed
const response = await fetch('/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query: '{ hello }' })
})
console.log(response.status) // 200
```

## Error Response

When a request is blocked by CSRF prevention, you'll receive a 400 status with the following error:

```json
{
  "data": null,
  "errors": [{
    "message": "This operation has been blocked as a potential Cross-Site Request Forgery (CSRF)."
  }]
}
```

## Migration Guide

If you're adding CSRF prevention to an existing Mercurius application:

### For Most Applications
✅ **No action required** - Most GraphQL clients already send appropriate headers.

### If You See CSRF Errors
1. **Check your client** - Ensure it sends `Content-Type: application/json` for POST requests
2. **Add required headers** - For GET requests, add `mercurius-require-preflight: true`
3. **Configure custom headers** - If needed, add your client's headers to `requiredHeaders`

### Legacy Client Support

For clients that can't be easily updated:

```javascript
await app.register(mercurius, {
  schema,
  resolvers,
  csrfPrevention: {
    requiredHeaders: [
      'x-mercurius-operation-name',
      'mercurius-require-preflight',
      'User-Agent', // Many clients send this automatically
      'X-Requested-With' // Common in AJAX libraries
    ]
  }
})
```

## Security Considerations

### When CSRF Prevention is Critical
- Applications with authentication/authorization
- APIs that perform mutations or have side effects
- Public-facing GraphQL endpoints
- Applications handling sensitive data

### When CSRF Prevention May Be Less Critical
- Public read-only APIs with no authentication
- Internal APIs on isolated networks
- Development environments (consider disabling temporarily)

### Best Practices
1. **Keep CSRF prevention enabled** in production
2. **Use HTTPS** to prevent header manipulation
3. **Implement proper CORS policies** as an additional layer
4. **Monitor for blocked requests** to catch client issues
5. **Test thoroughly** when adding custom required headers

## Troubleshooting

### Common Issues

**Q: My requests are being blocked with a 400 error**
A: Ensure your client sends `Content-Type: application/json` or add `mercurius-require-preflight: true` header.

**Q: GraphiQL stopped working**
A: GraphiQL should work automatically. If not, check if you've misconfigured the routes or added overly restrictive headers.

**Q: My frontend or mobile app requests are blocked**  
A: Check the HTTP client configuration. Most modern clients work automatically, but ensure proper Content-Type headers.

**Q: I need to support a legacy client**
A: Add the client's existing headers to `requiredHeaders`, or as a last resort, disable CSRF prevention.

### Debug Mode

To debug CSRF prevention issues, you can temporarily log requests:

```javascript
app.addHook('preHandler', async (request, reply) => {
  if (request.url.includes('/graphql')) {
    console.log('GraphQL request headers:', request.headers)
    console.log('Content-Type:', request.headers['content-type'])
  }
})
```

### Testing Your Configuration

Create a simple test to verify CSRF protection is working:

```javascript
// test-csrf.js
const test = async () => {
  // This should be blocked
  try {
    const blocked = await fetch('http://localhost:4000/graphql?query={hello}')
    console.log('CSRF test failed - request was not blocked:', blocked.status)
  } catch (error) {
    console.log('CSRF correctly blocked the request')
  }
  
  // This should work
  try {
    const allowed = await fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ hello }' })
    })
    console.log('Valid request succeeded:', allowed.status === 200)
  } catch (error) {
    console.log('Valid request failed:', error.message)
  }
}

test()
