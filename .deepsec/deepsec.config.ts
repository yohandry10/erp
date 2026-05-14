import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "erp", root: ".." },
    // <deepsec:projects-insert-above>
  ],
});
