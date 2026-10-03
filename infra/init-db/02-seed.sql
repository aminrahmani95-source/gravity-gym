-- Iranian Multi-Gym Fitness Platform - Seed Data
-- Initial economic parameters, facilities, plans, and demo venues

-- 1. System Configs (Economic & Security Parameters - Single Source of Truth)
INSERT INTO system_configs (key, value_json, description) VALUES
('global_max_payout_per_credit_ratio', '{"value": 32000}', 'Golden Bounding Inequality derived ceiling for standard plan'),
('default_rollover_percentage', '{"value": 0.10}', 'Default partial rollover cap (10%)'),
('default_max_rollover_credits', '{"value": 5}', 'Maximum absolute credits that can roll over'),
('default_cooldown_minutes', '{"value": 120}', 'Minimum interval between visits at the same gym'),
('default_club_monthly_visit_cap', '{"value": 4}', 'Maximum visits allowed per month at a single specific club'),
('impossible_velocity_kmh_threshold', '{"value": 70}', 'Maximum feasible speed between two consecutive gym check-ins'),
('qr_validity_seconds', '{"value": 45}', 'Cryptographic validity lifetime of dynamic QR tokens'),
('qr_nonce_retention_seconds', '{"value": 90}', 'Replay-prevention nonce retention TTL in Redis'),
('otp_resend_cooldown_seconds', '{"value": 60}', 'SMS OTP re-dispatch interval cooldown'),
('otp_max_attempts', '{"value": 5}', 'Maximum failed OTP verification attempts before invalidation'),
('default_peak_multiplier', '{"value": 1.25}', 'Default multiplier for peak Sans credit pricing'),
('variable_cost_per_subscriber_tomans', '{"value": 40000}', 'Monthly direct variable cost per active subscriber (VC_sub)'),
('variable_cost_per_checkin_tomans', '{"value": 500}', 'Direct operational and messaging friction per check-in (VC_checkin)')
ON CONFLICT (key) DO NOTHING;

-- 2. Standard Facilities Catalog
INSERT INTO facilities (name_fa, slug, icon, is_premium) VALUES
('وزنه‌های آزاد و بدنسازی', 'free_weights', 'dumbbell', false),
('دستگاه‌های هوازی', 'cardio', 'activity', false),
('رختکن و کمد اختصاصی', 'lockers', 'lock', false),
('دوش و حمام', 'showers', 'droplet', false),
('سونا خشک و بخار', 'sauna', 'flame', true),
('جکوزی و حوضچه آب سرد', 'jacuzzi', 'waves', true),
('استخر المپیک', 'olympic_pool', 'pool', true),
('باکس کراس‌فیت', 'crossfit', 'zap', true),
('بوفه سلامت و ویتامینه', 'cafe', 'coffee', false)
ON CONFLICT (slug) DO NOTHING;

-- 3. Membership Plans (Configurable Inflow Parameters)
INSERT INTO plans (slug, title_fa, price_tomans, credits_awarded, validity_days, rollover_percentage, max_rollover_credits, is_active, sort_order) VALUES
('starter_15', 'پلن برنزی - ۱۵ اعتبار', 550000, 15, 30, 0.1000, 2, true, 1),
('standard_30', 'پلن نقره‌ای - ۳۰ اعتبار', 1000000, 30, 30, 0.1000, 5, true, 2),
('pro_60', 'پلن طلایی - ۶۰ اعتبار', 1900000, 60, 30, 0.1000, 10, true, 3)
ON CONFLICT (slug) DO NOTHING;

-- 4. Demo Users (Admin, Staff, Members)
-- Phone numbers in standard Iranian format: 09...
INSERT INTO users (id, phone_number, first_name, last_name, gender, role, status) VALUES
('00000000-0000-0000-0000-000000000001', '09120000001', 'مدیر', 'سیستم', 'MALE', 'SUPER_ADMIN', 'ACTIVE'),
('00000000-0000-0000-0000-000000000002', '09120000002', 'رضا', 'محمدی (پذیرش اسپیناس)', 'MALE', 'GYM_STAFF', 'ACTIVE'),
('00000000-0000-0000-0000-000000000003', '09120000003', 'علی', 'احمدی', 'MALE', 'USER', 'ACTIVE'),
('00000000-0000-0000-0000-000000000004', '09120000004', 'سارا', 'کرمی', 'FEMALE', 'USER', 'ACTIVE')
ON CONFLICT (phone_number) DO NOTHING;

-- 5. Demo Gyms Across Tiers in Tehran
INSERT INTO gyms (id, name_fa, tier, access_mode, city, district, address_fa, latitude, longitude, geofence_radius_meters, sheba_number, bank_account_holder, is_active) VALUES
-- Tier 1: Basic (Female Only)
('10000000-0000-0000-0000-000000000001', 'باشگاه بدنسازی کارو', 'BASIC', 'FEMALE_ONLY', 'تهران', 'نواب', 'خیابان قزوین، خیابان عباسی، پلاک ۴۲', 35.672000, 51.385000, 200, 'IR430120000000000000000001', 'محمد رستمی', true),
-- Tier 2: Plus (Male Only)
('10000000-0000-0000-0000-000000000002', 'مجموعه ورزشی ستاره ونک', 'PLUS', 'MALE_ONLY', 'تهران', 'ونک', 'میدان ونک، خیابان ملاصدرا، پلاک ۱۰', 35.758000, 51.398000, 150, 'IR160120000000000000000002', 'ستاره ورزش ایرانیان', true),
-- Tier 3: Premium (Mixed Shifts)
('10000000-0000-0000-0000-000000000003', 'باشگاه اکسیژن رویال', 'PREMIUM', 'MIXED', 'تهران', 'سعادت آباد', 'بلوار سرو غربی، خیابان صدف، مجتمع صدف', 35.789000, 51.372000, 150, 'IR860120000000000000000003', 'باشگاه اکسیژن پارس', true),
-- Tier 4: Elite (Mixed Shifts)
('10000000-0000-0000-0000-000000000004', 'کلاب ورزشی هتل اسپیناس پالاس', 'ELITE', 'MIXED', 'تهران', 'سعادت آباد', 'بیدستان یکم، هتل اسپیناس پالاس، طبقه -۲', 35.795000, 51.365000, 250, 'IR590120000000000000000004', 'هتل بین المللی اسپیناس', true)
ON CONFLICT (id) DO UPDATE SET access_mode = EXCLUDED.access_mode;

-- Link staff member to gym
UPDATE users SET assigned_gym_id = '10000000-0000-0000-0000-000000000004' WHERE id = '00000000-0000-0000-0000-000000000002';

-- 6. Pricing Overrides (Validates Golden Bounding Inequality: M/C <= 32,000 T/credit)
INSERT INTO gym_pricing_overrides (gym_id, credit_cost, monetary_payout_tomans, offpeak_credit_cost, peak_credit_cost, notes) VALUES
-- Basic: 2 cr, 30,000 T (15,000 T/cr <= 32,000)
('10000000-0000-0000-0000-000000000001', 2, 30000, 2, 2, 'قرارداد استاندارد سطح ۱'),
-- Plus: 4 cr, 65,000 T (16,250 T/cr <= 32,000)
('10000000-0000-0000-0000-000000000002', 4, 65000, 3, 5, 'قرارداد سطح ۲ با تعرفه سانس اوج'),
-- Premium: 7 cr, 115,000 T (16,428 T/cr <= 32,000)
('10000000-0000-0000-0000-000000000003', 7, 115000, 6, 8, 'قرارداد سطح ۳ شامل استخر و سونا'),
-- Elite: 14 cr, 230,000 T (16,428 T/cr <= 32,000)
('10000000-0000-0000-0000-000000000004', 14, 230000, 12, 16, 'قرارداد هتل اسپیناس، رزرو قبلی الزامی')
ON CONFLICT DO NOTHING;

-- 7. Gym Operating Sans (Gender Shifts)
-- Saturday to Thursday: Women 08:00 - 14:00, Men 14:30 - 23:00
DO $$
DECLARE
    g_id UUID;
    d SMALLINT;
BEGIN
    FOR g_id IN SELECT id FROM gyms LOOP
        FOR d IN 0..5 LOOP -- Saturday to Thursday
            -- Women Sans
            INSERT INTO gym_sans (gym_id, day_of_week, gender, start_time, end_time, capacity, is_peak)
            VALUES (g_id, d, 'FEMALE', '08:00:00', '14:00:00', 30, (d IN (0, 2))) ON CONFLICT DO NOTHING;
            -- Men Sans
            INSERT INTO gym_sans (gym_id, day_of_week, gender, start_time, end_time, capacity, is_peak)
            VALUES (g_id, d, 'MALE', '14:30:00', '23:59:59', 40, true) ON CONFLICT DO NOTHING;
            -- Men Late Night Sans
            INSERT INTO gym_sans (gym_id, day_of_week, gender, start_time, end_time, capacity, is_peak)
            VALUES (g_id, d, 'MALE', '00:00:00', '05:00:00', 30, false) ON CONFLICT DO NOTHING;
            -- Men Daytime Sans (enables testing across daytime business hours)
            INSERT INTO gym_sans (gym_id, day_of_week, gender, start_time, end_time, capacity, is_peak)
            VALUES (g_id, d, 'MALE', '05:00:00', '14:30:00', 30, false) ON CONFLICT DO NOTHING;
        END LOOP;
        -- Friday (Men Morning / Special)
        INSERT INTO gym_sans (gym_id, day_of_week, gender, start_time, end_time, capacity, is_peak)
        VALUES (g_id, 6, 'MALE', '10:00:00', '18:00:00', 25, true) ON CONFLICT DO NOTHING;
        INSERT INTO gym_sans (gym_id, day_of_week, gender, start_time, end_time, capacity, is_peak)
        VALUES (g_id, 6, 'MALE', '00:00:00', '05:00:00', 25, false) ON CONFLICT DO NOTHING;
    END LOOP;
END $$;
