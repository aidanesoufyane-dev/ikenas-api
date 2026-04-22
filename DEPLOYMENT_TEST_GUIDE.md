# Pre-Deployment Test Guide — Ikenas Backend API
# Run every check below before going live. Fix any FAIL before deploying.

---

## STEP 1 — Environment Setup

Before starting the server, create a `.env` file from the template and fill in ALL values:

```
PORT=5000
NODE_ENV=production
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>/ikenas_prod
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
JWT_EXPIRE=7d
CLIENT_URL=https://your-frontend-domain.com
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=your-firebase-client-email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

**Checklist:**
- [ ] `JWT_SECRET` is set to a long random string (min 48 chars) — server will refuse to start in production without it
- [ ] `MONGO_URI` points to the production MongoDB cluster, NOT localhost
- [ ] `NODE_ENV=production` is set
- [ ] `CLIENT_URL` is the real frontend URL (used for CORS)
- [ ] Firebase credentials are real (needed for push notifications)

---

## STEP 2 — Start Server & Smoke Test

```bash
npm start
```

**Expected output:**
```
╔══════════════════════════════════════════╗
║   🏫 Ikenas Gestion API                 ║
║   Port: 5000                             ║
╚══════════════════════════════════════════╝
```

**Test health endpoint:**
```bash
curl http://localhost:5000/api/health
```
Expected: `{ "success": true, "message": "Ikenas Gestion API is running" }`

- [ ] Server starts without crashing
- [ ] Health endpoint returns 200
- [ ] No `JWT_SECRET absent` warning in logs (would mean JWT_SECRET not set)

---

## STEP 3 — Authentication Tests

### 3a. Login with valid credentials
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ikenas.com","password":"Admin1234"}'
```
Expected: `{ "success": true, "token": "eyJ..." }`
- [ ] Returns token ✅

### 3b. Login with wrong password
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ikenas.com","password":"wrongpass"}'
```
Expected: `{ "success": false }` with status 401
- [ ] Returns 401 ✅

### 3c. Rate limit test — brute force protection
Run the login command 31 times quickly. On the 31st call it should return 429.
```bash
for i in $(seq 1 31); do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d '{"email":"x@x.com","password":"bad"}'; done
```
- [ ] 31st request returns 429 (Too Many Requests) ✅

### 3d. Access protected route without token
```bash
curl http://localhost:5000/api/students
```
Expected: `{ "success": false, "message": "Accès non autorisé. Token manquant." }` with status 401
- [ ] Returns 401 ✅

### 3e. Deactivated account cannot login
- In the DB, set a user's `isActive: false`
- Try to login — should return 401 "Compte désactivé"
- [ ] Returns 401 ✅

---

## STEP 4 — Role Authorization Tests

Save your admin token: `TOKEN="eyJ..."`

### 4a. Student cannot access admin endpoints
Login as a student, then:
```bash
curl -H "Authorization: Bearer $STUDENT_TOKEN" http://localhost:5000/api/students
```
Expected: 403 Forbidden
- [ ] Returns 403 ✅

### 4b. Teacher cannot access other classes
Login as a teacher, then try to send a message to a class they don't teach.
Expected: 403 Forbidden
- [ ] Returns 403 ✅

---

## STEP 5 — Messaging Tests (Most Critical for Flutter App)

Login as a **teacher**, save token as `$TEACHER_TOKEN`.
Login as a **student/parent**, save token as `$STUDENT_TOKEN`.

### 5a. Teacher sends a message with allowReply=true
```bash
curl -X POST http://localhost:5000/api/messages \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Test message","recipientType":"individual","targetUser":"<STUDENT_USER_ID>","allowReply":true}'
```
Save the returned message `_id` as `$MSG_ID`.
- [ ] Returns 201 with message object ✅
- [ ] Response contains `sender.avatar` field (not null) ✅
- [ ] Response contains `sender.fullName` or `sender.firstName` ✅

### 5b. Student fetches messages and sees the teacher's message
```bash
curl -H "Authorization: Bearer $STUDENT_TOKEN" http://localhost:5000/api/messages
```
- [ ] Returns 200 with the teacher's message in the list ✅
- [ ] `sender.avatar` is present ✅

### 5c. Student replies to the message
```bash
curl -X POST http://localhost:5000/api/messages/$MSG_ID/reply \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Student reply"}'
```
- [ ] Returns 201 ✅

### 5d. Student fetches messages again — reply must appear
```bash
curl -H "Authorization: Bearer $STUDENT_TOKEN" http://localhost:5000/api/messages
```
- [ ] The student's own reply is visible in the list (tests the `sender: user.id` filter) ✅
- [ ] This was the critical bug — if reply is missing, the fix did not apply

### 5e. Student CANNOT reply to a message with allowReply=false
```bash
curl -X POST http://localhost:5000/api/messages/$REPLY_ID/reply \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Should fail"}'
```
Expected: 403 "Réponse non autorisée pour ce message."
- [ ] Returns 403 ✅

---

## STEP 6 — Assignment Tests

### 6a. Student submits an assignment
```bash
curl -X POST http://localhost:5000/api/assignments/<ASSIGNMENT_ID>/submit \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```
- [ ] Returns 201 ✅

### 6b. Student re-fetches assignments — submitted one shows as done
```bash
curl -H "Authorization: Bearer $STUDENT_TOKEN" http://localhost:5000/api/assignments
```
- [ ] The submitted assignment has `isSubmitted: true` or `status: "done"` ✅
- [ ] (Note: this requires the fix from Issue #1 — if not yet fixed, this will fail)

---

## STEP 7 — Notification Tests

### 7a. Fetch notifications
```bash
curl -H "Authorization: Bearer $STUDENT_TOKEN" http://localhost:5000/api/notifications
```
- [ ] Returns list ✅

### 7b. Mark ONE notification as read (must NOT clear all)
```bash
curl -X PUT http://localhost:5000/api/notifications/read \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ids":["<NOTIFICATION_ID>"]}'
```
Fetch notifications again — only the one you marked should be read.
- [ ] Only the targeted notification is marked read ✅
- [ ] Other notifications remain unread ✅
- [ ] (This tests the critical bug from Issue #14)

---

## STEP 8 — Security Checks

### 8a. Security headers present
```bash
curl -I http://localhost:5000/api/health
```
Look for these headers in the response:
- [ ] `X-Frame-Options: SAMEORIGIN` (or DENY) ✅
- [ ] `X-Content-Type-Options: nosniff` ✅
- [ ] `X-DNS-Prefetch-Control` ✅

### 8b. NoSQL injection blocked
```bash
curl "http://localhost:5000/api/students?search=.*" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```
- [ ] Returns a normal (potentially empty) list — does NOT dump all student records ✅
- [ ] No server crash or 500 error ✅

### 8c. Cannot download another student's receipt
Login as student A, get their payment ID. Then login as student B and try:
```bash
curl -H "Authorization: Bearer $STUDENT_B_TOKEN" \
  "http://localhost:5000/api/payments/<STUDENT_A_PAYMENT_ID>/download-receipt"
```
Expected: 403 Forbidden
- [ ] Returns 403 ✅

### 8d. CORS blocks unknown origins
```bash
curl -H "Origin: https://evil.com" -I http://localhost:5000/api/health
```
- [ ] Response does NOT contain `Access-Control-Allow-Origin: https://evil.com` ✅

---

## STEP 9 — File Upload Tests

### 9a. Upload a file attachment with a message
```bash
curl -X POST http://localhost:5000/api/messages \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -F "content=Test with file" \
  -F "recipientType=broadcast" \
  -F "attachments=@/path/to/test.pdf"
```
- [ ] Returns 201 with attachment URL in response ✅
- [ ] File accessible at returned URL ✅

### 9b. Uploaded file served correctly
```bash
curl -I http://localhost:5000/uploads/messages/<filename>
```
- [ ] Returns 200 ✅
- [ ] Has `Cross-Origin-Resource-Policy: cross-origin` header (needed for Flutter app) ✅

---

## STEP 10 — MongoDB & Performance

### 10a. Database connected
Check startup logs — should see MongoDB connected message, no connection errors.
- [ ] No MongoDB connection errors in logs ✅

### 10b. Indexes exist (run in MongoDB shell or Compass)
```javascript
db.messages.getIndexes()
db.students.getIndexes()
```
- [ ] Messages collection has index on `{ targetUser: 1, isActive: 1 }` — if missing, add it
- [ ] Messages collection has index on `{ targetClass: 1, isActive: 1 }` — if missing, add it

### 10c. API responds quickly with many records
With 100+ messages in DB, run:
```bash
time curl -H "Authorization: Bearer $STUDENT_TOKEN" http://localhost:5000/api/messages
```
- [ ] Response time under 500ms ✅

---

## STEP 11 — Socket.io Real-Time Test

Open two browser tabs or two terminal sessions.

**Session 1 (teacher)** — connect to socket and listen:
```javascript
const socket = io('http://localhost:5000', { auth: { token: TEACHER_TOKEN } });
socket.on('new-message', (msg) => console.log('Received:', msg));
```

**Session 2 (student)** — send a reply via API.

- [ ] Teacher receives `new-message` event in real time without polling ✅
- [ ] Socket connects successfully with valid JWT ✅
- [ ] Socket refuses connection with invalid/expired JWT ✅

---

## STEP 12 — Flutter App Compatibility Check

Run the Flutter app pointed at your backend URL and verify each screen:

| Screen | Test | Expected |
|--------|------|----------|
| Login | Login with valid credentials | Dashboard loads |
| Dashboard | All stats visible | No "--" values |
| Chat | Teacher sends message, parent replies | Reply visible after refresh |
| Homework | Parent taps "Terminé" | Status stays done after refresh |
| Notifications | Tap one notification | Only that one marked read |
| Payments | View and download receipt | File downloads correctly |
| Profile | Update name/phone | Changes persist |

---

## KNOWN ISSUES (Not Blocking but Document Before Launch)

- **Issue #4** — Only one reply possible per allowReply=true message. Teachers must send new messages to re-enable replies.
- **Issue #5** — allowReply has no expiration. Old messages stay replyable forever.
- **Issue #13** — Teacher stats screen may show blank data if no grades are entered yet.
- **Bus tracking** — GPS tracking endpoints exist in routes but depend on real GPS hardware/data feeds.
- **Behavior module** — endpoints exist but require real behavioral data to be entered by admin first.

---

## DEPLOYMENT CHECKLIST SUMMARY

```
[ ] .env has JWT_SECRET (48+ char random string)
[ ] .env has MONGO_URI pointing to production DB
[ ] NODE_ENV=production
[ ] npm install completed (helmet, compression, express-rate-limit now included)
[ ] MongoDB Atlas IP whitelist includes server IP
[ ] Firebase credentials configured for push notifications
[ ] HTTPS/TLS configured on reverse proxy (nginx/caddy)
[ ] All 12 steps above passed
[ ] Backend logs reviewed — no startup errors
[ ] Flutter app .env / AppConfig points to production API URL
```

> If all boxes are checked: you are ready to deploy. 🚀
