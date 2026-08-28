# Setting up live mode (Firebase)

This turns on a real, free cloud database so your sales/inventory/customer
data is backed up, syncs across every device, and keeps working offline at
a show. Takes about 15 minutes. No coding — just clicking through Google's
setup screens and pasting a few values into one file.

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and sign in with (or create)
   a Google account — ideally one just for the business, e.g.
   `bigscreencollectables@gmail.com`, so it's not tied to a personal account.
2. Click **Add project**, name it something like `bsc-pos`, and finish the
   wizard (Google Analytics is optional — you can turn it off).

## 2. Turn on Firestore (the database)

1. In the left sidebar, click **Build → Firestore Database**.
2. Click **Create database**.
3. Choose **Start in production mode** (not test mode).
4. Pick a location close to you (any Australian region if offered,
   otherwise the closest one).

### Security rules

Still on the Firestore page, click the **Rules** tab and replace the
contents with this, then click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isOwner() {
      return signedIn() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "owner";
    }

    match /users/{userId} {
      allow read: if signedIn();
      allow create: if signedIn() && request.auth.uid == userId; // first login creates your own doc
      allow update, delete: if isOwner();
    }

    match /items/{itemId} {
      allow read, write: if signedIn();
    }
    match /customers/{id} {
      allow read, write: if signedIn();
    }
    match /events/{id} {
      allow read, write: if signedIn();
    }
    match /sales/{id} {
      allow read, write: if signedIn();
    }
    match /imports/{id} {
      allow read, write: if signedIn();
    }
    match /meta/{id} {
      allow read, write: if signedIn();
    }
  }
}
```

This means: anyone signed in (you or staff) can use the app, but only an
"owner" can edit other people's account records. If you later want staff
to be blocked from seeing cost prices or reports, that's a further rule
change we can make once you're using it day to day.

## 3. Turn on Storage (product photos)

1. Left sidebar → **Build → Storage → Get started**, click through the
   defaults (production mode, same location you picked for Firestore).
2. Click the **Rules** tab and replace the contents with this, then click
   **Publish**:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /items/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

This is what lets you attach photos to a product from the Inventory screen.
If you don't need photos yet, you can skip this step and come back to it
later — nothing else in the app depends on it.

## 4. Turn on sign-in (Authentication)

1. Left sidebar → **Build → Authentication → Get started**.
2. Click the **Sign-in method** tab, choose **Email/Password**, enable it,
   and save.

## 5. Register a Web App and get your config keys

1. Click the gear icon (top-left, next to "Project Overview") → **Project
   settings**.
2. Scroll to **Your apps**, click the **</>** (Web) icon.
3. Give it a nickname (e.g. "BSC POS Web"), skip Firebase Hosting for now
   (we'll do that in step 8), click **Register app**.
4. You'll see a code block with a `firebaseConfig` object — copy the six
   values (`apiKey`, `authDomain`, `projectId`, `storageBucket`,
   `messagingSenderId`, `appId`).

## 6. Paste your config into the app

Open `js/config.js` in the app folder and:

1. Change `export const APP_MODE = "demo";` to `export const APP_MODE = "firebase";`
2. Paste your six values into the `FIREBASE_CONFIG` object, replacing each
   `"REPLACE_ME"`.

Save the file. That's the only code change needed.

## 7. Create your own login

1. Back in the Firebase console → **Authentication → Users → Add user**.
2. Enter your email and choose a password. This is what you'll use to sign
   into the POS app.
3. The *first* person to ever sign into the app is automatically made the
   "owner" (full access, including Settings → staff accounts). Make sure
   that's you — sign in as this account before adding anyone else.

## 8. Put it online (Firebase Hosting)

This gives you a real web address you (and staff) can open from any
device, and is what makes the app installable like a real app.

You'll need [Node.js](https://nodejs.org) installed once on your computer,
then, in a terminal, inside the app folder:

```
npm install -g firebase-tools
firebase login
firebase init hosting
```

When `firebase init hosting` asks questions, answer:
- "Use an existing project" → pick the project you created in step 1
- "What do you want to use as your public directory?" → `.` (a single dot)
- "Configure as a single-page app?" → **No**
- "Set up automatic builds with GitHub?" → No
- If it asks to overwrite `index.html` → **No**

Then deploy:

```
firebase deploy --only hosting
```

It will print a URL like `https://bsc-pos.web.app` — that's your app's
permanent address. Open it, sign in, and install it (in Chrome: the
install icon in the address bar; on a phone: "Add to Home Screen").

Whenever you make changes to the app files later, run
`firebase deploy --only hosting` again to publish the update.

## 9. (Optional) Email receipts — EmailJS

Printing receipts works out of the box. To also let you email a receipt
to a customer:

1. Go to <https://www.emailjs.com> and create a free account.
2. **Email Services** → add your email (Gmail works well) and note the
   **Service ID**.
3. **Email Templates** → create a template. Use these variables somewhere
   in the template body: `{{to_email}}`, `{{order_lines}}`, `{{total}}`,
   `{{event_name}}`, `{{shop_name}}`. Note the **Template ID**.
4. **Account → General** → copy your **Public Key**.
5. Paste all three into `EMAILJS_CONFIG` in `js/config.js`.
6. Redeploy (`firebase deploy --only hosting`) if you're already live.

Free tier covers a couple hundred emails a month, which is plenty for
receipts at this scale.

## Adding staff later

Once you're signed in as the owner, go to **Settings** in the app and use
**+ Add staff**. Give the person the temporary password you set there —
they sign in with their email and that password.

## If something goes wrong

- **"Missing or insufficient permissions"** — usually means the Firestore
  rules above haven't been published yet, or you're not signed in.
- **Blank page after switching to `APP_MODE = "firebase"`** — double check
  you copied all six config values exactly (no extra quotes/spaces).
- Any of this can be redone from scratch by deleting the Firebase project
  and starting again at step 1 — nothing is lost on your computer since
  the app code itself doesn't change.
