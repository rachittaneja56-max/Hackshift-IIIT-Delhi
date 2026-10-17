import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The root API workspace also brings Clerk's optional React peer into the
  // install tree. Keep every web dependency on the frontend's React instance.
  resolve: { dedupe: ["react", "react-dom"] },
});
