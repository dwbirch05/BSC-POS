# Setting up Card Intake (AI card reading)

Card Intake reads trading card photos with AI (identifies the card, judges
its condition, and drafts a title/description). It works right away in demo
mode with made-up sample data, but *real* AI reading needs two things you
don't have yet:

1. An **Anthropic API account** (with billing) -- this is what actually
   looks at the photos and reads the card.
2. Your **Firebase project upgraded to the "Blaze" plan** -- this feature
   needs a small piece of server-side code (a Cloud Function) to keep your
   API key private, and Cloud Functions require Blaze. Blaze is still
   free for normal use at this shop's scale (see "About the Blaze plan and
   cost" below) -- it just removes a hard cap that the free "Spark" plan has.

This assumes you've already followed `FIREBASE_SETUP.md` and are running in
live (Firebase) mode. Takes about 15-20 minutes.

## 1. Create an Anthropic API account and key

1. Go to <https://console.anthropic.com> and sign up (or sign in).
2. Add billing: left sidebar → **Billing** → add a card and put a small
   amount of credit on the account (a few dollars covers a lot of cards --
   see the cost note below).
3. Left sidebar → **API Keys** → **Create Key**. Give it a name like
   `bsc-pos-card-intake`.
4. Copy the key it shows you (starts with `sk-ant-...`) -- you won't be able
   to see it again after you leave the page. Paste it somewhere safe for a
   moment; you'll need it in step 4 below.

## 2. Upgrade your Firebase project to Blaze

1. Go to <https://console.firebase.google.com>, open your project.
2. Bottom-left, click the plan name (probably "Spark") → **Upgrade**.
3. Choose **Blaze (Pay as you go)** and attach a billing account (a Google
   Cloud billing account -- you may need to create one, same idea as any
   Google Cloud service).

## 3. Install the Firebase CLI (one-time, if you haven't already)

You'll need [Node.js](https://nodejs.org) installed (same requirement as
`FIREBASE_SETUP.md` step 8). Then, in a terminal:

```
npm install -g firebase-tools
firebase login
```

## 4. Store your Anthropic key as a Firebase secret

**Never paste your API key into any file in this app folder** -- it must
only live in Firebase's secret storage, which is what keeps it off the
browser entirely. From inside the app folder:

```
cd functions
npm install
cd ..
firebase use --add
```

(`firebase use --add` links this folder to your Firebase project if you
haven't already -- pick the project you created in `FIREBASE_SETUP.md`.)

Then set the secret:

```
firebase functions:secrets:set ANTHROPIC_API_KEY
```

It will prompt you to paste the key from step 1 -- paste it and press Enter.

## 5. Deploy the Cloud Function

```
firebase deploy --only functions
```

This uploads `functions/index.js` (already written for you -- it reads the
two card photos, calls Anthropic, and hands back the identification) to
Firebase. It'll print a line confirming `identifyCard` deployed
successfully.

If this is the first `firebase deploy` for Functions in this project, the
CLI may ask to enable a couple of Google Cloud APIs (Cloud Functions,
Cloud Build, Artifact Registry, Eventarc) -- say yes to each; they're all
part of what Blaze/Functions needs and don't cost anything extra on their
own.

## 6. Try it

Open the app in live mode, sign in with an account listed in
`CARD_AI_ALLOWED_EMAILS` (see below), go to **Card Intake** from Home, and
upload a couple of test photos. The first real card you process is the
first time this whole path (browser → Cloud Function → Anthropic → back) is
actually exercised end to end, so it's worth trying with 2-3 cards before
trusting it with a big batch.

## Who can use Card Intake

Open `js/config.js` and edit the `CARD_AI_ALLOWED_EMAILS` list -- add the
login email of anyone who should see and use this feature, one per line.
Reload the app after saving; no redeploy needed for this part since it's
just a client-side file.

**Also update the matching list in `functions/index.js`** (`ALLOWED_EMAILS`
near the top) to the same set of emails, then redeploy
(`firebase deploy --only functions`). The client-side list hides the
feature from the menu; this server-side copy is a backstop so the Cloud
Function itself refuses anyone not on the list, even if called directly.

## About the Blaze plan and cost

Blaze only charges for what you actually use, and Cloud Functions has a
generous free monthly allowance (2 million invocations) built in even on
Blaze -- at your volumes (up to ~1000 cards/week) you're extremely unlikely
to see a Firebase/Cloud Functions bill from this feature at all. The actual
cost is the Anthropic API usage itself (charged separately, on your
Anthropic account) -- each card is two photos plus a short prompt, so
1000 cards/week is a modest, predictable cost; keep an eye on
**console.anthropic.com → Billing** for your actual usage once you're
running real batches, since this sandbox has no way to measure real-world
cost for you in advance.

## If something goes wrong

- **"This account isn't enabled for Card Intake"** when calling the
  function -- the email you're signed in with isn't in `ALLOWED_EMAILS`
  inside `functions/index.js` (see above), or you forgot to redeploy after
  editing it.
- **Deploy fails mentioning secrets/permissions** -- re-run
  `firebase functions:secrets:set ANTHROPIC_API_KEY` and make sure you're
  on the Blaze plan (step 2).
- **A card comes back with everything blank / "couldn't be read
  automatically"** -- the AI's reply didn't parse as expected; try that
  card again, and if it keeps happening on a lot of cards, let me know so
  the prompt in `functions/index.js` can be tuned (it was written without
  the ability to test it against a real key, so some tuning after real
  use is expected).
- Demo mode (`APP_MODE = "demo"` in `js/config.js`) never touches any of
  this -- it always works with made-up sample results, so you can keep
  clicking through the feature there any time regardless of the above.
