# Stock Tracker

A React + Vite inventory/stock tracking app with Firebase Firestore as the backend, for tracking shift-based sales (morning/evening) of cigarettes and alcohol.

## Project structure

```
stock-tracker/
├── src/
│   ├── main.jsx        # React entry point
│   ├── App.jsx          # Main application component (staff view + admin dashboard)
│   ├── Modal.jsx         # Reusable modal component
│   ├── firebase.js      # Firebase init + Firestore helper functions
│   ├── constants.js     # Seed items, shifts config, admin password, helpers
│   └── index.css        # Global styles
├── index.html            # Vite HTML entry
├── vite.config.js        # Vite config (includes GitHub Pages base path)
├── package.json
└── .github/workflows/deploy.yml   # Auto-deploy to GitHub Pages on push to main
```

## 1. Local setup

```bash
npm install
npm run dev
```

This starts a local dev server (usually at `http://localhost:5173`).

## 2. Before deploying: set the correct base path

Open `vite.config.js` and make sure the `base` field matches your **exact GitHub repo name**:

```js
export default defineConfig({
  plugins: [react()],
  base: "/your-repo-name/",
});
```

If you skip this step, the deployed site will load with broken CSS/JS (blank white page) because asset paths will be wrong.

## 3. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

## 4. Enable GitHub Pages (one-time setup)

1. Go to your repo on GitHub → **Settings** → **Pages**
2. Under "Build and deployment", set **Source** to **GitHub Actions**
3. Push to `main` (or just wait if you just pushed) — the included workflow at `.github/workflows/deploy.yml` will automatically build and deploy your site
4. Check the **Actions** tab to watch the deploy run. Once it's green, your site will be live at:
   `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`

Every time you `git push` to `main` after this, it will auto-rebuild and redeploy.

## Firebase / Firestore notes

This app uses Firestore collections `inventory` (current day + items list) and `inventory_history` (saved daily summaries). Firebase config and security rules are managed in the [Firebase Console](https://console.firebase.google.com/), not in this repo.

**Security note:** Your Firebase API key and config are visible in `src/firebase.js` and will be publicly visible once deployed — this is normal and expected for Firebase web apps (the API key is not a secret), but your actual data security comes from your **Firestore security rules**, not from hiding this config. Make sure your Firestore rules in the Firebase Console restrict who can read/write your `inventory` and `inventory_history` collections appropriately, since right now anyone with your project ID could potentially read/write data if rules are too permissive.

The in-app "Admin" password (`admin123` in `src/constants.js`) is a basic UI gate only — it is not real authentication and provides no actual security, since it's visible in the deployed source code. Anyone who opens browser dev tools can read it. If you need real access control, use Firebase Authentication instead.
