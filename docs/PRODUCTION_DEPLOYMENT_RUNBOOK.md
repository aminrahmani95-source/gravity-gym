# راهنمای جامع استقرار در محیط عملیاتی (Production Deployment Runbook)
## پلتفرم یکپارچه گراویتی اسپرت (Gravity Sport Platform)

---

### ۱. معماری و نیازمندی‌های سخت‌افزاری سرور (Infrastructure Architecture)

#### ۱.۱. مشخصات پیشنهادی سرور (Production Server Specs)
* **سیستم‌عامل پایه**: Ubuntu Server 22.04 LTS یا 24.04 LTS (x86_64)
* **پردازنده (CPU)**: حداقل ۴ هسته (توصیه: ۸ هسته vCPU)
* **حافظه رم (RAM)**: حداقل ۸ گیگابایت (توصیه: ۱۶ گیگابایت برای پایگاه داده و کش هم‌زمان)
* **فضای ذخیره‌سازی (Storage)**: حداقل ۵۰ گیگابایت SSD NVMe با پشتیبانی از کشف خطای دیسک و پشتیبان‌گیری
* **توپولوژی استقرار استاندارد**:
```
  [ Internet / Mobile App / Web Browser ]
                    │
                    ▼ HTTPS (Port 443)
       ┌─────────────────────────┐
       │ Nginx Reverse Proxy / SSL│
       └────────────┬────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  Next.js 16 Web           NestJS API
  (Port 3000)              (Port 4000)
        │                       │
        │                       ▼
        │               ┌───────────────┐
        │               │ PostgreSQL 17 │
        │               │  (Port 5432)  │
        │               └───────┬───────┘
        ▼                       │
  [ User Client ]       ┌───────┴───────┐
                        │    Redis 7    │
                        │  (Port 6379)  │
                        └───────────────┘
```

---

### ۲. پیکربندی متغیرهای محیطی و امنیت توکن‌ها (Environment & Secrets)

در محیط پروداکشن، ساختار Fail-Closed برقرار است. اگر متغیرهای اجباری تعیین نشده باشند یا از رشته‌های پیش‌فرض محیط توسعه استفاده شود، سرور بلافاصله متوقف خواهد شد.

#### متغیرهای الزامی در فایل `.env.production`:
```ini
# --- 1. تنظیمات عمومی ران‌تایم ---
NODE_ENV=production
PORT=4000
WEB_PORT=3000
WEB_ORIGIN=https://gravity.ir,https://gym.gravity.ir

# --- 2. پایگاه داده اصلی (PostgreSQL 17/18) ---
DATABASE_URL=postgresql://gravity_app_user:PROD_STRONG_PASSWORD_HERE@127.0.0.1:5432/gym_platform_db
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=gravity_app_user
DB_PASSWORD=PROD_STRONG_PASSWORD_HERE
DB_NAME=gym_platform_db

# --- 3. کش توزیع‌شده و قفل ضد بازپخش (Redis 7) ---
REDIS_URL=redis://:PROD_REDIS_PASSWORD@127.0.0.1:6379

# --- 4. کلیدهای رمزنگاری امنیتی (حداقل ۳۲ کاراکتر تصادفی) ---
# تولید کلید در لینوکس: openssl rand -base64 36
JWT_SECRET=PROD_RANDOMLY_GENERATED_JWT_SECRET_32_PLUS_CHARS
JWT_EXPIRATION_HOURS=72
QR_SIGNING_SECRET=PROD_RANDOMLY_GENERATED_QR_HMAC_SECRET_32_CHARS
QR_TTL_SECONDS=45

# --- 5. تنظیمات عمومی کلاینت فرانت‌اند ---
NEXT_PUBLIC_API_URL=https://api.gravity.ir/api/v1
NEXT_PUBLIC_ENABLE_DEMO_LOGIN=false

# --- 6. درگاه پیامک پیام‌رسان ایرانی ---
SMS_PROVIDER=kavenegar  # kavenegar / ghasedak
SMS_API_KEY=YOUR_OFFICIAL_PROVIDER_API_KEY
SMS_OTP_PATTERN_CODE=gravity_login_otp_pattern
SMS_SENDER_NUMBER=10008000

# --- 7. درگاه پرداخت شاپرک / بانکی ---
PAYMENT_GATEWAY_PROVIDER=sep  # sep (سامان کیش) / zarinpal
PAYMENT_MERCHANT_ID=YOUR_TERMINAL_ID_HERE
PAYMENT_CALLBACK_URL=https://gravity.ir/payments/callback
PAYMENT_CURRENCY_BASE=TOMAN
```

---

### ۳. آماده‌سازی و راه‌اندازی سرویس‌های پایه

#### ۳.۱. نصب ابزارهای پایه روی اوبونتو
```bash
sudo apt-get update && sudo apt-get install -y \
  curl git ufw nginx postgresql postgresql-contrib redis-server certbot python3-certbot-nginx
```

#### ۳.۲. پیکربندی امن پایگاه داده PostgreSQL
```bash
# ایجاد پایگاه داده و کاربر با انکودینگ صریح UTF-8
sudo -u postgres psql << EOF
CREATE ROLE gravity_app_user WITH LOGIN PASSWORD 'PROD_STRONG_PASSWORD_HERE';
CREATE DATABASE gym_platform_db WITH OWNER gravity_app_user ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C';
GRANT ALL PRIVILEGES ON DATABASE gym_platform_db TO gravity_app_user;
\c gym_platform_db
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EOF
```

#### ۳.۳. اجرای مایگریشن‌های ساختاری پایگاه داده
```bash
PGPASSWORD='PROD_STRONG_PASSWORD_HERE' psql -h 127.0.0.1 -U gravity_app_user -d gym_platform_db -f infra/init-db/01-init.sql
PGPASSWORD='PROD_STRONG_PASSWORD_HERE' psql -h 127.0.0.1 -U gravity_app_user -d gym_platform_db -f infra/init-db/02-seed.sql
```

#### ۳.۴. تنظیم پایگاه داده سریع Redis
در فایل `/etc/redis/redis.conf`:
```ini
requirepass PROD_REDIS_PASSWORD
appendonly yes
appendfsync everysec
maxmemory 2gb
maxmemory-policy volatile-lru
```
اعمال تغییرات:
```bash
sudo systemctl restart redis-server
```

---

### ۴. استقرار سرویس‌های اپلیکیشن (Application Deployment)

#### روش اول: استقرار کانتینری با Docker Compose (پیشنهادی)
```bash
# بیلد و بالا آوردن کانتینرها در حالت دیمن
docker compose --env-file .env.production up -d --build

# بررسی وضعیت سلامت سرویس‌ها
docker compose ps
```

#### روش دوم: اجرای نیتیو با Process Manager (PM2)
```bash
# بیلد کامل ورک‌اسپیس‌ها
npm ci
npm run --workspace=@gym-app/shared-types build
npm run --workspace=@gym-app/api build
npm run --workspace=@gym-app/web build

# راه‌اندازی با PM2
pm2 start apps/api/dist/src/main.js --name "gravity-api" --env .env.production
pm2 start "npm --workspace=@gym-app/web start" --name "gravity-web" --env .env.production
pm2 save
pm2 startup
```

---

### ۵. تنظیمات Reverse Proxy Nginx و گواهینامه SSL

فایل تنظیمات `/etc/nginx/sites-available/gravity`:
```nginx
# هدایت خودکار HTTP به HTTPS
server {
    listen 80;
    server_name gravity.ir gym.gravity.ir api.gravity.ir;
    return 301 https://$host$request_uri;
}

# API Backend (api.gravity.ir)
server {
    listen 443 ssl http2;
    server_name api.gravity.ir;

    ssl_certificate /etc/letsencrypt/live/api.gravity.ir/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.gravity.ir/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 2M;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
    }
}

# Web Frontend (gravity.ir)
server {
    listen 443 ssl http2;
    server_name gravity.ir gym.gravity.ir;

    ssl_certificate /etc/letsencrypt/live/gravity.ir/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gravity.ir/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

---

### ۶. بررسی پروب‌های سلامت و وضعیت پلتفرم (Health Probes)

1. **Liveness Probe (زنده بودن فرآیند)**:
   ```bash
   curl -i https://api.gravity.ir/api/v1/health/live
   # پاسخ: HTTP 200 {"status":"ok","uptime":...}
   ```
2. **Readiness Probe (آمادگی سرویس‌دهی و اتصال به PG و Redis)**:
   ```bash
   curl -i https://api.gravity.ir/api/v1/health/ready
   # پاسخ: HTTP 200 {"status":"ok","dependencies":{"database":{"ok":true},"redis":{"ok":true}}}
   ```
3. **Metrics Probe (پایش منابع)**:
   ```bash
   curl -i https://api.gravity.ir/api/v1/health/metrics
   ```

---

### ۷. استراتژی پشتیبان‌گیری خودکار و بازیابی بحران (Disaster Recovery)

#### کرون‌جاب پشتیبان‌گیری روزانه در ساعت ۰۲:۳۰ بامداد:
در `crontab -e`:
```cron
30 2 * * * /usr/bin/node /opt/gravity/scripts/test-backup-restore-drill.mjs >> /var/log/gravity_backup.log 2>&1
```

#### دستور بازیابی در زمان بحران:
```bash
# ایجاد دیتابیس تمیز و اعمال فایل نسخه پشتیبان
PGPASSWORD='PROD_PASSWORD' pg_restore -h 127.0.0.1 -U gravity_app_user -d gym_platform_db -v --single-transaction backup_gym_platform_db.dump
```

---

### ۸. سناریوی بازگشت به نسخه قبل (Rollback Procedure)

در صورت بروز مشکل پس از استقرار:
1. **کانتینرها**:
   ```bash
   docker compose down
   git checkout <PREVIOUS_COMMIT_TAG>
   docker compose up -d --build
   ```
2. **محیط نیتیو**:
   ```bash
   git checkout <PREVIOUS_COMMIT_TAG>
   npm run --workspaces build
   pm2 restart all
   ```
