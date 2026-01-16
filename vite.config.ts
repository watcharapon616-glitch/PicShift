import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/', // <--- เปลี่ยนจาก '/PicShift/' เป็น '/' เพื่อให้รองรับ Custom Domain
})