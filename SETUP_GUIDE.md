# 🎁 Looking Good Zak — Setup Guide
### A step-by-step guide to get the app live at lookinggoodzak.vercel.app

This should take about 20–30 minutes and you only need to do it once.
You'll need: your phone or laptop, a Google account, and the app files I've given you.

---

## PART 1 — Get your Anthropic API key
*(This is what lets the app talk to Claude AI)*

1. Go to **console.anthropic.com** and sign up for a free account
2. Once logged in, click **"API Keys"** in the left menu
3. Click **"Create Key"**, give it a name like "lookinggoodzak"
4. **Copy the key** — it starts with `sk-ant-...`
5. Paste it somewhere safe (like Notes on your phone) — you'll need it in a moment

> ⚠️ Keep this key private. Don't share it or post it anywhere public.

---

## PART 2 — Set up Firebase (free database + photo storage)
*(This is where Zak's wardrobe and style data will live)*

1. Go to **firebase.google.com** and click **"Get started"**
2. Sign in with your Google account
3. Click **"Create a project"**
   - Name it: `lookinggoodzak`
   - Disable Google Analytics (you don't need it) → click **Create project**
4. Once it's created, click **"Web"** (the `</>` icon) to add a web app
   - Give it a nickname: `lookinggoodzak`
   - Click **"Register app"**
5. You'll see a block of code that looks like this:
   ```
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "lookinggoodzak.firebaseapp.com",
     ...
   }
   ```
   **Copy all of this** — you'll paste it into the app in Part 3

6. Now set up the **database**:
   - In the left menu click **"Firestore Database"**
   - Click **"Create database"**
   - Choose **"Start in test mode"** → Next → pick any location → Enable

7. Now set up **photo storage**:
   - In the left menu click **"Storage"**
   - Click **"Get started"**
   - Choose **"Start in test mode"** → Next → Done

---

## PART 3 — Add your keys to the app files

Open the file called **`src/firebase.js`** in a text editor (TextEdit on Mac, Notepad on Windows).

Replace the placeholder values with your real Firebase config from Part 2:

```js
const firebaseConfig = {
  apiKey: "paste your real value here",
  authDomain: "paste your real value here",
  projectId: "paste your real value here",
  storageBucket: "paste your real value here",
  messagingSenderId: "paste your real value here",
  appId: "paste your real value here"
};
```

Then open **`src/App.js`** and find this line near the top:
```js
const ANTHROPIC_API_KEY = "REPLACE_WITH_YOUR_ANTHROPIC_API_KEY";
```
Replace `REPLACE_WITH_YOUR_ANTHROPIC_API_KEY` with the key you copied in Part 1.

Save both files.

---

## PART 4 — Deploy to Vercel (put it on the internet for free)

1. Go to **vercel.com** and sign up (you can use your Google account)
2. Once logged in, click **"Add New Project"**
3. Choose **"Upload"** (you don't need GitHub for this)
4. Drag and drop the entire **`lookinggoodzak`** folder into the upload area
5. Vercel will detect it's a React app automatically
6. Under **"Project Name"** type: `lookinggoodzak`
7. Click **"Deploy"**
8. Wait about 2 minutes while it builds
9. 🎉 When it's done, your app is live!

**To get the URL `lookinggoodzak.vercel.app`:**
- In your Vercel project, go to **Settings → Domains**
- The default URL will be something like `lookinggoodzak-abc123.vercel.app`
- You can change it to `lookinggoodzak.vercel.app` if it's available, or use whatever URL Vercel gives you

---

## PART 5 — Set up Zak's wardrobe (before his birthday!)

1. Open the app URL on YOUR phone
2. Go to the **Wardrobe** tab
3. Tap **"+ Add item"** for each piece of clothing
   - Take a photo of each item laid flat or on a hanger
   - The app will automatically name it — you can edit the name
   - Add any notes you know (e.g. "runs warm", "cotton")
4. For items that don't fit right now, add them then **shelf** them with the right reason

> 💡 **Tip:** Do this room by room — all his tops first, then bottoms, etc. You can do it over a few days, everything saves automatically.

---

## PART 6 — Give it to Zak for his birthday 🎂

1. Just send him the URL (e.g. `lookinggoodzak.vercel.app`)
2. When he opens it on his phone, **all the wardrobe you built will already be there**
3. Tell him to add it to his home screen so it feels like a real app:
   - **iPhone:** Open the URL in Safari → tap the Share button (box with arrow) → "Add to Home Screen" → "Add"
   - **Android:** Open in Chrome → tap the three dots → "Add to Home screen"

---

## If you want to make changes later

Come back to this Claude conversation and say "I want to update Looking Good Zak" — we can add features, change anything, or fix things together. Once you have the new files, just go back to Vercel and upload the updated folder — it'll redeploy automatically.

---

## Costs

| Thing | Cost |
|---|---|
| Firebase (database + photos) | Free up to 1GB storage, 50k reads/day — more than enough |
| Vercel (hosting) | Free |
| Anthropic API (Claude AI) | ~$0.01–0.05 per outfit recommendation. A few dollars a month max |

---

*Made with love for Zak 💛*
