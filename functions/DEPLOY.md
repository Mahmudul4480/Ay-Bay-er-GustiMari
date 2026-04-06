# Deploy: processNotificationQueue Cloud Function

## Prerequisites

1. **Firebase CLI installed globally**
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**
   ```bash
   firebase login
   ```

3. **Blaze (pay-as-you-go) plan enabled** on your Firebase project.
   Cloud Functions require Blaze plan. Free tier usage stays within $0 for low traffic.
   Go to: https://console.firebase.google.com/project/ay-bay-er-gustimari/usage/details

---

## Deploy Steps

### 1. Install dependencies inside the functions folder

```bash
cd functions
npm install
```

### 2. Build TypeScript → JavaScript

```bash
npm run build
```

### 3. Deploy from the project root

```bash
cd ..
firebase deploy --only functions
```

Or deploy everything (functions + Firestore rules + Storage rules):

```bash
firebase deploy
```

---

## How It Works

```
AdminEngagement (client)
    │
    │ addDoc(notificationQueue, { userId, title, message, clickAction, status: "pending" })
    ▼
Firestore: notificationQueue/{docId}
    │
    │ onDocumentCreated trigger
    ▼
processNotificationQueue (Cloud Function)
    │
    ├── 1. Read queue doc (userId, title, message, clickAction, blogId)
    ├── 2. Fetch users/{userId}.fcmToken
    ├── 3. messaging.send({ token, notification, webpush, data })
    └── 4. Update queue doc → status: "sent" | "failed"
```

---

## Region

The function is deployed to **asia-south1** (Mumbai) which is closest to Bangladesh.
If your Firestore is in a different region, update `region` in `functions/src/index.ts`:

```typescript
region: "asia-south1",  // change to "us-central1" etc. if needed
```

---

## Verify Deployment

```bash
firebase functions:log --only processNotificationQueue
```

Or check the Firebase Console:
https://console.firebase.google.com/project/ay-bay-er-gustimari/functions

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `messaging/invalid-registration-token` | User's FCM token is stale — function auto-removes it from Firestore |
| `messaging/registration-token-not-registered` | Same as above — token cleaned up automatically |
| `PERMISSION_DENIED` | Make sure Firestore rules allow admin read on `users/{userId}` — Admin SDK bypasses client rules automatically |
| `Function exceeded memory` | Increase memory in `index.ts`: add `memory: "256MiB"` to options |
