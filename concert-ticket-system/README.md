# 🎵 ConcertTix - Hệ Thống Đặt Vé Concert

**Tác giả:** NamViet Media Dev Team  
**Ngày hoàn thiện:** 30/06/2026

---

## 📋 Mô Tả Dự Án

Hệ thống đặt vé concert giải quyết bài toán high-concurrency: **500 vé** cho **5.000 người dùng** đồng thời, chống overselling, với trải nghiệm real-time mượt mà.

---

## 🚀 Hướng Dẫn Chạy Project

### Cách 1: Docker Compose (Khuyến nghị)

```bash
# Clone / vào thư mục project
cd concert-ticket-system

# Khởi động toàn bộ stack (PostgreSQL + Redis + Backend + Frontend)
docker-compose up -d

# Kiểm tra logs
docker-compose logs -f backend

# Truy cập
# Frontend (trang đặt vé): http://localhost:5173
# Tra cứu vé:              http://localhost:5173/lookup
# Admin Dashboard:         http://localhost:5173/admin
# Backend API:             http://localhost:3000
# Readiness probe:         http://localhost:3000/health/ready
```

> Backend có healthcheck (`/health`); frontend chỉ khởi động sau khi backend `healthy`.
> Lần đầu chạy, backend tự `prisma db push` + seed 500 vé rồi mới `npm start`.

### Cách 2: Chạy Local (Development)

**Yêu cầu:** Node.js 20+, PostgreSQL 14+, Redis 7+

```bash
# 1. Khởi động PostgreSQL và Redis (Docker)
docker run -d --name postgres -p 5432:5432 \
  -e POSTGRES_DB=concert_tickets \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  postgres:16-alpine

docker run -d --name redis -p 6379:6379 redis:7-alpine

# 2. Backend setup
cd backend
cp .env.example .env
npm install
npx prisma db push          # Đồng bộ schema vào database
npx ts-node prisma/seed.ts  # Seed 500 vé mẫu
npm run dev
# Backend sẽ chạy trên http://localhost:3000

# 3. Frontend setup (terminal mới)
cd frontend
npm install
npm run dev
# Frontend sẽ chạy trên http://localhost:5173
```

### Chạy Tests

```bash
cd backend
npm test              # Chạy tất cả tests
npm run test:coverage # Với coverage report
```

---

## 🏗️ Kiến Trúc Hệ Thống

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│         Vite + TypeScript + Tailwind + Socket.io-client     │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP + WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│                  Backend API (Express)                       │
│              Node.js + TypeScript + Socket.io                │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │  API Routes  │  │  Services    │  │   Socket.io       │   │
│  │  + Zod Val  │  │  + RedisLock │  │   Real-time Push  │   │
│  └──────┬──────┘  └──────┬───────┘  └───────────────────┘   │
│         └────────────────┘                                   │
└───────────────┬────────────────┬────────────────────────────┘
                │                │
    ┌───────────▼──────┐  ┌──────▼────────────┐
    │   PostgreSQL 16  │  │    Redis 7         │
    │   Prisma ORM     │  │  Distributed Lock  │
    │   Atomic UPDATE  │  │  + Pub/Sub         │
    └──────────────────┘  └───────────────────┘
```

---

## 🎯 Các Giải Pháp Kỹ Thuật

### 1. Chống Over-selling (Concurrency Control)

**Vấn đề:** 5.000 users cùng bấm "Chọn vé" trong 1 mili-giây → race condition → bán quá 500 vé.

**Giải pháp 2 lớp:**

**Lớp 1 - Redis Distributed Lock** (Application Layer):
```typescript
// utils/redisLock.ts
// SET key value PX 10000 NX - atomic, chỉ 1 process acquire được
const result = await client.set(lockKey, lockValue, 'PX', LOCK_TTL_MS, 'NX');
```
- Serialize concurrent requests cho cùng 1 loại vé
- Nếu lock fail → retry 3 lần với exponential backoff
- Lock TTL 10 giây đảm bảo không deadlock
- Release bằng Lua script (check-and-delete) → không xóa nhầm lock của process khác

**Lớp 2 - Atomic Conditional UPDATE** (Database Layer):
```typescript
// repositories/ticketRepository.ts — Prisma updateMany sinh ra:
// UPDATE ticket_types SET availableQuantity = availableQuantity - {qty}
// WHERE id = {ticketTypeId} AND availableQuantity >= {qty}
const result = await tx.ticketType.updateMany({
  where: { id: ticketTypeId, availableQuantity: { gte: quantity } },
  data: { availableQuantity: { decrement: quantity } },
});
return result.count === 1; // count === 0 → hết vé / thua race
```
- PostgreSQL đảm bảo atomicity ở mức row, điều kiện `gte` nằm ngay trong câu UPDATE
- Ngay cả khi Redis lock bị bypass, UPDATE sẽ chặn overselling
- Trả về số row affected: nếu = 0 → sold out

> **Đã kiểm chứng:** 60 request song song (× 2 vé = 120 vé) trên hạng VIP Diamond (50 vé) →
> đúng 25 hold thành công (50 vé), `availableQuantity` chạm đúng 0, **không bao giờ âm**.

**Defense-in-depth:** Redis lock giảm tải DB, SQL là safety net cuối cùng.

---

### 2. Giữ Vé (Hold & Release)

**Luồng:**
```
User chọn vé
    → Redis lock acquire
    → PostgreSQL transaction:
        - CHECK available_quantity >= requested
        - ATOMIC UPDATE available_quantity -= quantity
        - INSERT ticket_hold (status=PENDING, expires_at=NOW()+5min)
    → Redis lock release
    → Schedule expiry notification (setTimeout)
    → Broadcast ticket count update (Socket.io)
```

**Auto-release expired holds (batched):**
- Background job chạy mỗi 30 giây, có cờ `isRunning` chống chạy chồng
- Query 1 lần các hold `PENDING` đã hết hạn, tái dùng cho cả release lẫn notify
- **Batch release trong 1 transaction:** 1 câu `updateMany` set status=EXPIRED cho tất cả +
  cộng trả tồn kho gộp theo từng loại vé (thay vì N transaction riêng lẻ) → nhẹ DB khi tải cao
- Broadcast `hold_expired` event đến client

**Giải phóng vé sớm khi rời trang:** Khi user đóng tab / back khỏi trang thanh toán mà chưa trả tiền,
frontend dùng `navigator.sendBeacon` gọi `/api/tickets/release` → trả vé về kho ngay, không phải chờ hết 5 phút.

---

### 3. Real-time Updates (Socket.io)

- Mỗi khi vé được hold/release/confirm → `broadcastTicketUpdate()`
- Client nhận event `ticket_count_updated` → cập nhật UI ngay lập tức
- Không cần polling → tiết kiệm tài nguyên server
- Fallback: React Query polling mỗi 60 giây phòng WebSocket disconnect

---

### 4. Frontend UX Under High Load

- **Spam click prevention:** Button disabled + `hasClicked` state flag sau lần click đầu
- **Loading states:** Spinner trên button, skeleton loader cho data fetch
- **Rate limiting:** Server-side 5 request/phút cho hold endpoint
- **Countdown timer:** Đồng bộ với `expiresAt` từ server, không phải client time
- **Socket reconnection:** Auto-reconnect với exponential backoff
- **Error boundary:** Global axios interceptor → thông báo lỗi cụ thể bằng tiếng Việt
- **Request timeout:** 10 giây timeout cho mọi API call
- **Auto-release khi rời trang:** `navigator.sendBeacon` trả vé về kho khi đóng tab / huỷ
- **Tra cứu vé:** Trang `/lookup` cho khách kiểm tra vé đã mua bằng mã vé

---

### 5. Clean Code Architecture

```
backend/src/
├── config/       # Database, Redis, Env validation (Zod)
├── controllers/  # HTTP handlers (thin layer, no business logic)
├── services/     # Business logic (holdTicket, processPayment...)
├── repositories/ # Data access layer (SQL queries)
├── middleware/   # Error handler, rate limiter, validation
├── routes/       # Route definitions
└── utils/        # Logger, AppError classes, Redis lock
```

**Global Error Handling:** Tất cả lỗi được phân loại qua `AppError` hierarchy → middleware serialize thành JSON nhất quán với HTTP status code và error code.

**Data Validation:** Zod schemas ở cửa ngõ API — reject invalid input trước khi vào business logic.

---

## 📡 API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/events/active` | Lấy thông tin sự kiện + số vé còn lại |
| POST | `/api/tickets/hold` | Giữ vé (5 phút) — rate limit 5 req/phút/session |
| POST | `/api/tickets/release` | Hủy giữ vé (cũng dùng cho sendBeacon) |
| GET | `/api/tickets/hold/:id/status` | Kiểm tra trạng thái giữ vé |
| GET | `/api/tickets/lookup/:ticketCode` | Tra cứu vé đã mua theo mã |
| POST | `/api/payments/process` | Thanh toán giả lập |
| GET | `/api/admin/stats` | Thống kê tổng quan (đã bán / đang giữ / còn lại) — cache 5s |
| GET | `/api/admin/holds` | Danh sách vé đang bị giữ |
| POST | `/api/admin/ticket-types/:id/slots` | Thêm slot (tăng totalQuantity + availableQuantity) — broadcast real-time |
| GET | `/health` | Liveness probe |
| GET | `/health/ready` | Readiness probe — kiểm tra DB + Redis |

**WebSocket Events:**
- `ticket_count_updated` → Cập nhật số vé real-time
- `hold_expired` → Thông báo hold đã hết hạn

---

## 🧪 Unit Tests

```bash
cd backend && npm test
```

**25 tests** trên 3 suite:
- `ticketService.test.ts` - Hold logic, payment, batched expired-hold cleanup, gộp tồn kho theo loại vé
- `AppError.test.ts` - Error class hierarchy và HTTP status codes
- `redisLock.test.ts` - Lock acquire/release, retry logic, race condition simulation

---

## 🛠️ Tech Stack

| Layer | Technology | Lý do chọn |
|-------|------------|------------|
| Backend Runtime | Node.js 20 + TypeScript | Performance, type safety |
| HTTP Framework | Express.js | Lightweight, middleware ecosystem |
| ORM | Prisma | Type-safe queries, migrations |
| Database | PostgreSQL 16 | ACID, row-level locking |
| Cache / Lock | Redis 7 | Distributed lock, in-memory speed |
| Real-time | Socket.io | WebSocket với fallback |
| Validation | Zod | Runtime type validation |
| Frontend | React 18 + Vite | Fast HMR, TypeScript |
| UI Styling | Tailwind CSS | Utility-first, dark theme |
| Data Fetching | TanStack Query | Caching, retry, background sync |
| Containerization | Docker + Compose | Reproducible environment |
