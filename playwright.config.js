import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./tests',
  testMatch:'**/*.spec.js',
  use:{baseURL:'http://localhost:8765'},
  webServer:{command:'python3 -m http.server 8765 --bind 127.0.0.1 --directory dist', url:'http://localhost:8765', reuseExistingServer:false},
});
