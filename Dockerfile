# Dùng hệ điều hành Linux có sẵn Node.js 18
FROM node:20-bookworm

# Cài đặt Python, PIP và FFmpeg (rất quan trọng để ghép video+audio chất lượng cao)
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg

# Cài đặt lõi yt-dlp
RUN pip3 install yt-dlp --break-system-packages

# Thiết lập thư mục làm việc
WORKDIR /app

# Copy các file cấu hình thư viện vào trước
COPY package.json package-lock.json* ./

# Cài đặt thư viện Node.js
RUN npm install

# Copy toàn bộ source code vào máy chủ
COPY . .

# Khởi tạo Prisma (bắt buộc)
RUN npx prisma generate

# Build ứng dụng Next.js để chạy thực tế
RUN npm run build

# Mở cổng 3000
EXPOSE 3000

# Lệnh khởi động web
CMD ["npm", "start"]