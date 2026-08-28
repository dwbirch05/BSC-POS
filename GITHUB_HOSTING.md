# Hosting the app on GitHub Pages (free, no command line needed)

This puts the app online at a real web address using GitHub instead of the
Firebase Hosting steps in `FIREBASE_SETUP.md` — GitHub Pages is simpler to
get started with since it's all done through GitHub's website. Note this
only hosts the app's *screens*; you still need Firebase (see
`FIREBASE_SETUP.md`) for the actual database once you're ready to move off
demo mode.

## 1. Create a GitHub account

Go to <https://github.com/signup> and create a free account.

## 2. Create a repository

1. Click the **+** in the top-right corner → **New repository**.
2. Name it `bsc-pos` (or anything you like).
3. Leave it **Public** (required for free GitHub Pages on a free account)
   and leave every checkbox unticked (no README, no .gitignore).
4. Click **Create repository**.

## 3. Upload the app files

On the new (empty) repository page:

1. Click **uploading an existing file** (or **Add file → Upload files**).
2. Unzip `bsc-pos.zip` on your computer, then drag the *contents* of that
   folder (`index.html`, `manifest.webmanifest`, `sw.js`, the `css/`,
   `js/`, and `icons/` folders, etc.) into the upload box — not the outer
   `bsc-pos` folder itself, its contents.
3. Scroll down, click **Commit changes**.

(If drag-and-drop of whole folders doesn't work in your browser, install
[GitHub Desktop](https://desktop.github.com) instead — it lets you point
at the unzipped folder and publish it in a couple of clicks.)

## 4. Turn on GitHub Pages

1. In your repository, go to **Settings** → **Pages** (left sidebar, under
   "Code and automation").
2. Under **Build and deployment → Source**, choose **Deploy from a
   branch**.
3. Branch: **main**, folder: **/ (root)** → **Save**.
4. Wait about a minute, then refresh the page — GitHub will show your live
   URL, something like:
   `https://your-username.github.io/bsc-pos/`

Open that link — you've got the app live, in demo mode, on a real web
address you can open from any device or install to a home screen.

## 5. Going live (Firebase) with this setup

Follow `FIREBASE_SETUP.md` as written, with one difference at the end:
instead of `firebase deploy`, you'll edit `js/config.js` (switch
`APP_MODE` to `"firebase"` and paste in your keys) and re-upload just that
one file through **Add file → Upload files** again, then **Commit
changes**. GitHub Pages picks up the change automatically within a
minute or two.

## Updating the app later

Any time a file changes, re-upload it the same way (Add file → Upload
files → drag the changed file(s) → Commit). GitHub keeps the full history
of every version, so you can always see (or undo) what changed.
