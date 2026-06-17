import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: replace "stock-tracker" below with your EXACT GitHub repo name.
// If your repo is github.com/yourname/inventory-app, this should be "/inventory-app/"
export default defineConfig({
  plugins: [react()],
  base: "/stock-tracker/",
});
