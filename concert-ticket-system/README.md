# 🎵 ConcertTix - Hệ Thống Đặt Vé Concert

**Tác giả:** Ngô Trí Huy — ngohuy04022000@gmail.com  
**Ngày hoàn thiện:** 01/07/2026

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

> **Đã kiểm chứng bằng load test thực tế (01/07/2026):**
> 5.000 users đồng thời gửi request hold VIP Diamond (50 vé) →
> đúng **50 hold thành công**, 4.950 trả về SOLD\_OUT (409), `availableQuantity` chạm đúng **0, không bao giờ âm**,
> `avail + held + sold = 50/50` — kế toán hoàn toàn chính xác.

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
| GET | `/api/admin/stats` | Thống kê tổng quan (đã bán / đang giữ / còn lại) — cache 5s — yêu cầu `x-admin-key` |
| GET | `/api/admin/holds` | Danh sách vé đang bị giữ — yêu cầu `x-admin-key` |
| POST | `/api/admin/ticket-types/:id/slots` | Thêm slot — broadcast real-time — yêu cầu `x-admin-key` |
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

**26 tests** trên 3 suite:
- `ticketService.test.ts` - Hold logic, payment, batched expired-hold cleanup, gộp tồn kho theo loại vé
- `AppError.test.ts` - Error class hierarchy và HTTP status codes
- `redisLock.test.ts` - Lock acquire/release, retry logic, race condition simulation, Redis-down scenario

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

---

## ⚙️ Biến Môi Trường

| Biến | Bắt buộc | Mặc định | Mô tả |
|------|----------|----------|-------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `REDIS_URL` | | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | ✅ | — | Tối thiểu 16 ký tự |
| `HOLD_DURATION_MINUTES` | | `5` | Thời gian giữ vé (phút) |
| `FRONTEND_URL` | | `http://localhost:5173` | CORS origin |
| `ADMIN_API_KEY` | | _(không bảo vệ)_ | Key bảo vệ `/api/admin/*`; gửi qua header `x-admin-key` |
| `RATE_LIMIT_MAX` | | `60` | Số request tối đa/phút/IP toàn cục |

---

## 📋 Nhật Ký Cập Nhật

### 01/07/2026 — Sửa lỗi & tăng cường khả năng chịu tải

#### 🐛 Sửa lỗi (Code Review)

| # | File | Lỗi | Mức độ |
|---|------|-----|--------|
| 1 | `ticketRepository.ts` | `confirmHold` không có điều kiện status → 2 request đồng thời cùng confirm 1 hold → vé bị duplicate | CRITICAL |
| 2 | `ticketService.ts` | Không kiểm tra kết quả `confirmHold` (count = 0) → không throw khi race condition xảy ra | CRITICAL |
| 3 | `ticketController.ts` | `req.query.sessionId` có kiểu `string \| string[] \| ParsedQs` — so sánh trực tiếp không an toàn | HIGH |
| 4 | `ticketController.ts` | Thiếu `invalidateStatsCache()` sau payment → admin dashboard hiển thị doanh thu cũ tới 5 giây | MEDIUM |
| 5 | `ticketController.ts` | `throw new Error()` bypass `AppError` handler → trả 500 thay vì 400 `VALIDATION_ERROR` | MEDIUM |
| 6 | `SocketContext.tsx` | `onHoldExpired` là plain function → tham chiếu mới mỗi render → `useEffect` re-subscribe liên tục | MEDIUM |
| 7 | `AdminPage.tsx` | Chia 0/0 khi không có ticket type → hiển thị "NaN%" ở stat "Tỷ lệ bán" | MEDIUM |
| 8 | `useCountdown.ts` | `onExpire` không được gọi nếu `initialSeconds = 0` (hold đã hết hạn trước khi trang load) | MEDIUM |

**Chi tiết fix quan trọng nhất (bug #1 & #2):**
```typescript
// TRƯỚC — không có điều kiện status, 2 request đồng thời đều thành công
await tx.ticketHold.update({ where: { id: holdId }, data: { status: 'CONFIRMED' } });

// SAU — atomic, chỉ 1 request thắng; request còn lại nhận count = 0
const result = await tx.ticketHold.updateMany({
  where: { id: holdId, status: HoldStatus.PENDING }, // ← điều kiện status
  data: { status: HoldStatus.CONFIRMED, confirmedAt: new Date() },
});
if (result.count === 0) throw new ConflictError('Vé này đã được thanh toán rồi.');
```

---

#### 🛡️ Tăng cường khả năng chịu tải (Resilience)

**1. Redis down → 503 thay vì 500 mơ hồ**

Thêm `ServiceUnavailableError` vào `AppError` hierarchy. `withLock` bắt exception từ Redis và ném `ServiceUnavailableError(503)` với message rõ ràng thay vì để crash với raw `Error`.
Ngoài ra: `releaseLock` được bọc `.catch()` trong `finally` block — trước đây nếu Redis chết đúng lúc release, exception của release sẽ che mất exception gốc từ `fn()`.

**2. Prisma connection pool timeout → 503**

`errorHandler` nhận diện `PrismaClientKnownRequestError` với `code = 'P2024'` (pool timeout dưới tải cao) và trả `503 SERVICE_UNAVAILABLE` thay vì để rơi vào catch-all 500.

**3. 5.000 users connect WebSocket đồng loạt → thundering herd**

Trước: mỗi socket connection gọi `broadcastTicketUpdate()` → 1 DB query → 5.000 queries đồng thời.
Sau: `emitCurrentCountsToSocket(socket)` dùng cache 1 giây — trong burst 5.000 connections, chỉ 1 DB query được thực thi. Gửi riêng cho socket mới thay vì broadcast toàn bộ.

**4. Admin API không có xác thực**

Thêm `requireAdminKey` middleware cho tất cả `/api/admin/*` routes. Khi `ADMIN_API_KEY` được set trong env, mọi request phải gửi header `x-admin-key` khớp giá trị đó. Không set → mở (dev mode).

**5. Rate limit cứng → configurable**

`RATE_LIMIT_MAX` env var thay cho hằng số cứng `60`. Cho phép tùy chỉnh theo môi trường mà không cần rebuild code.

---

#### ✅ Kết quả Load Test — 5.000 Users Đồng Thời

```
Mục tiêu : VIP Diamond — 50 vé có sẵn
Users    : 5.000 | Batch: 100 concurrent | Thời gian: 57.9 giây

201 Hold success       :   50  ← đúng bằng số vé có sẵn
409 Sold out           : 4950  ← từ chối chính xác
429 Rate limited       :    0
Lỗi khác              :    0

TRƯỚC → SAU
  available :  50 →  0   (chạm đúng 0, không âm)
  held      :   0 → 50   (50 holds đang chờ thanh toán)
  sold      :   0 →  0

KIỂM TRA TÍNH TOÀN VẸN
  availableQuantity >= 0          : PASS
  avail + held + sold = total     : PASS (50/50)
```

**Kết luận:** Redis distributed lock + PostgreSQL atomic UPDATE hoạt động đúng dưới tải cao.
Không có overselling, không có vé bị mất, kế toán tồn kho hoàn toàn chính xác.
