# Cloudflare Workers & D1 - Local Setup

Tôi đã khởi tạo mồi Database cục bộ (local seeding) cho bạn thành công!

### 🏃‍♂️ Cách chạy Server local:

1. Đi vào thư mục `apps/server`:
   ```bash
   cd apps/server
   ```

2. Khởi động server local:
   ```bash
   npm run dev
   ```
   *(Server sẽ chạy tại `http://localhost:8787` và Client sẽ tự động kết nối qua đó)*

---

### 🚀 Cách Deploy trực tuyến (Cloudflare production):

Khi bạn muốn online hóa cơ sở dữ liệu:

1. **Tạo Database D1** trên Cloudflare Dashboard hoặc lệnh:
   ```bash
   npx wrangler d1 create aligrid-db
   ```
   *(Lệnh này trả về một chuỗi `database_id`)*

2. **Cập nhật `wrangler.toml`**:
   Thiết lập `database_id` thành ID bạn vừa nhận được ở bước 1.

3. **Mồi bảng biểu (Seeding)** lên Cloudflare thật:
   ```bash
   npx wrangler d1 execute aligrid-db --remote --file=schema.sql
   ```

4. **Kích hoạt Deploy**:
   ```bash
   npx wrangler deploy
   ```
