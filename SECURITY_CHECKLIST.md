# SECURITY_CHECKLIST.md

A running checklist of common vulnerability classes to test this project against. Check an item off once it's been verified *not* to apply (or has been fixed); leave a short note inline if something's found or intentionally deferred.

How to use it:
- Manually, walking through the app/backend with each item in mind.
- Or hand this file to Claude Code and ask it to check the codebase against a section (or all of it) — e.g. "go through the Secrets & credentials section of SECURITY_CHECKLIST.md".
- The `/security-review` skill covers some of the same ground (SQL/NoSQL injection, XSS, auth bypass, etc.) for a specific diff — this file is broader and isn't tied to a diff.

## Secrets & credentials
- [ ] 1. Exposed database credentials
- [ ] 2. Public `.env` files
- [ ] 3. Hardcoded API keys
- [ ] 11. Build logs leaking secrets
- [ ] 13. Leaked GitHub repos or commit history
- [ ] 14. Secrets included in frontend JavaScript
- [ ] 26. JWT secrets that are weak, leaked, or reused
- [ ] 30. Default credentials left unchanged
- [ ] 35. Logs containing tokens, emails, passwords, or private user data

## Auth & access control
- [ ] 4. Weak or missing authentication
- [ ] 5. No authorization checks
- [ ] 6. Users able to access other users' data
- [ ] 9. Admin routes left unprotected
- [ ] 15. Client-side-only security checks
- [ ] 24. Broken password reset flows
- [ ] 25. Weak session management
- [ ] 32. Payment or subscription checks only done on the frontend
- [ ] 33. Insecure direct object references (IDOR)
- [ ] 34. API endpoints that trust user-controlled IDs or roles
- [ ] 49. Poor tenant isolation in multi-user apps

## Input validation & injection
- [ ] 16. Missing input validation
- [ ] 17. SQL injection
- [ ] 18. NoSQL injection
- [ ] 19. Cross-site scripting (XSS)
- [ ] 20. Cross-site request forgery (CSRF)
- [ ] 21. Insecure file uploads
- [ ] 22. Path traversal bugs
- [ ] 23. Server-side request forgery (SSRF)
- [ ] 31. Webhook endpoints without signature verification

## Infra & configuration
- [ ] 7. Open database read/write permissions
- [ ] 8. Misconfigured Firebase / Supabase / S3 buckets
- [ ] 27. Overly permissive CORS
- [ ] 41. Excessive database permissions for the app user
- [ ] 46. Missing security headers
- [ ] 47. Cookies missing `HttpOnly`, `Secure`, or `SameSite`

## Exposure & information leakage
- [ ] 10. Debug pages exposed in production
- [ ] 12. Verbose error messages leaking stack traces
- [ ] 29. Public test or staging environments
- [ ] 36. Source maps exposed in production
- [ ] 45. Publicly exposed internal dashboards

## Rate limiting & abuse
- [ ] 28. Rate limits missing on login, signup, APIs, and AI endpoints

## Dependencies
- [ ] 37. Dependency vulnerabilities
- [ ] 38. Outdated packages

## AI-specific
- [ ] 39. Prompt injection in AI features
- [ ] 40. AI tools/actions allowed to access data without permission checks
- [ ] 50. Over-trusting generated code without review

## Data protection
- [ ] 48. Unencrypted sensitive data

## Operations
- [ ] 42. No audit logs
- [ ] 43. No monitoring or alerting
- [ ] 44. No backup or restore plan
