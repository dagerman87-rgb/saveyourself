import { defineConfig } from 'astro/config';

// GitHub Pages 프로젝트 사이트 배포 시 BASE_PATH=/<repo>/ 로 주입된다 (.github/workflows/deploy.yml)
export default defineConfig({
  site: process.env.SITE_URL,
  base: process.env.BASE_PATH ?? '/',
});
