import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/PicShift/', // <--- เพิ่มบรรทัดนี้ (ต้องตรงกับชื่อ Repository ของคุณ)
})