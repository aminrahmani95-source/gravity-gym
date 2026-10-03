-- Iranian Multi-Gym Fitness Platform - Database Initialization Schema (PostgreSQL 18)
-- Strict separation of credits, monetary payouts, and audit trails

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(15) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    national_code VARCHAR(10) UNIQUE,
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('MALE', 'FEMALE')),
    avatar_url TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'COACH', 'GYM_STAFF', 'GYM_OWNER', 'ADMIN', 'SUPER_ADMIN')),
    assigned_gym_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. Partner Gyms
CREATE TABLE IF NOT EXISTS gyms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_fa VARCHAR(200) NOT NULL,
    tier VARCHAR(20) NOT NULL CHECK (tier IN ('BASIC', 'PLUS', 'PREMIUM', 'ELITE')),
    access_mode VARCHAR(20) NOT NULL DEFAULT 'MIXED' CHECK (access_mode IN ('MALE_ONLY', 'FEMALE_ONLY', 'MIXED')),
    city VARCHAR(100) NOT NULL,
    district VARCHAR(100) NOT NULL,
    address_fa TEXT NOT NULL,
    latitude NUMERIC(10, 8) NOT NULL,
    longitude NUMERIC(11, 8) NOT NULL,
    geofence_radius_meters INTEGER NOT NULL DEFAULT 150,
    sheba_number VARCHAR(26) NOT NULL, -- Format: IR + 24 digits
    bank_account_holder VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    description_fa TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gyms_location ON gyms(city, district, is_active);
CREATE INDEX IF NOT EXISTS idx_gyms_tier ON gyms(tier);
CREATE INDEX IF NOT EXISTS idx_gyms_access_mode ON gyms(access_mode);
CREATE INDEX IF NOT EXISTS idx_gyms_active_created ON gyms(is_active, created_at, id);

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_assigned_gym'
    ) THEN
        ALTER TABLE users 
        ADD CONSTRAINT fk_users_assigned_gym 
        FOREIGN KEY (assigned_gym_id) REFERENCES gyms(id) ON DELETE SET NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_users_assigned_gym ON users(assigned_gym_id);

-- 3. Gym Branches (for multi-branch networks)
CREATE TABLE IF NOT EXISTS gym_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    branch_name_fa VARCHAR(150) NOT NULL,
    address_fa TEXT NOT NULL,
    latitude NUMERIC(10, 8) NOT NULL,
    longitude NUMERIC(11, 8) NOT NULL,
    phone VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Facilities & Amenities Catalog
CREATE TABLE IF NOT EXISTS facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_fa VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    icon VARCHAR(50),
    is_premium BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS gym_facilities (
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    PRIMARY KEY (gym_id, facility_id)
);

-- 5. Gym Sans (Gender-segregated operating shifts)
-- Day of week: 0 = Saturday (شنبه), 1 = Sunday ... 6 = Friday (جمعه)
CREATE TABLE IF NOT EXISTS gym_sans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('MALE', 'FEMALE')),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    capacity INTEGER DEFAULT NULL,
    is_peak BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_sans_times CHECK (start_time != end_time)
);
CREATE INDEX IF NOT EXISTS idx_gym_sans_lookup ON gym_sans(gym_id, day_of_week, gender);
CREATE INDEX IF NOT EXISTS idx_gym_sans_batch ON gym_sans(gym_id, day_of_week, start_time);

-- 6. Configurable Membership Plans
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) NOT NULL UNIQUE,
    title_fa VARCHAR(100) NOT NULL,
    price_tomans BIGINT NOT NULL CHECK (price_tomans >= 0),
    credits_awarded INTEGER NOT NULL CHECK (credits_awarded > 0),
    validity_days INTEGER NOT NULL DEFAULT 30,
    rollover_percentage NUMERIC(5, 4) NOT NULL DEFAULT 0.1000, -- 10% default
    max_rollover_credits INTEGER NOT NULL DEFAULT 5,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. User Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    starts_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')),
    auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_subscriptions_validity CHECK (expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_active ON subscriptions(expires_at, status);

-- 7.5. Persistent Payment Transactions (Idempotent Payment Ledger)
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authority VARCHAR(128) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    plan_id UUID REFERENCES plans(id) ON DELETE RESTRICT,
    payment_purpose VARCHAR(40) NOT NULL DEFAULT 'MEMBERSHIP_PLAN' CHECK (payment_purpose IN ('MEMBERSHIP_PLAN', 'CLASS_SINGLE_SESSION', 'COACH_MONTHLY_PLAN')),
    reference_id UUID,
    amount_rials BIGINT NOT NULL CHECK (amount_rials > 0),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED')),
    provider VARCHAR(64) NOT NULL DEFAULT 'SHAPARAK_EMULATOR',
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    reference_id_rrn VARCHAR(128),
    card_pan_masked VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    refund_reason TEXT,
    refund_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_payment_transactions_authority UNIQUE (authority)
);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_authority ON payment_transactions(authority);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user ON payment_transactions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created ON payment_transactions(created_at DESC);

-- 8. Append-Only Event Subledger for User Credits (Source of Truth for Member Balances)
CREATE TABLE IF NOT EXISTS credit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    delta_credits INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    entry_type VARCHAR(40) NOT NULL CHECK (entry_type IN (
        'PLAN_PURCHASE',
        'TOPUP_PURCHASE',
        'CHECKIN_DEBIT',
        'REFUND_CREDIT',
        'REFUND_DEBIT',
        'CYCLE_EXPIRATION_SETTLEMENT',
        'ROLLOVER_PRESERVED',
        'CREDIT_EXPIRATION_EXCESS',
        'EXPIRED_CREDIT',
        'CREDIT_BREAKAGE_EVENT',
        'ADMIN_ADJUSTMENT'
    )),
    reference_id UUID,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_ledger_checkin_debit ON credit_ledger(reference_id) WHERE reference_id IS NOT NULL AND entry_type = 'CHECKIN_DEBIT';
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_ledger_plan_purchase ON credit_ledger(reference_id) WHERE reference_id IS NOT NULL AND entry_type = 'PLAN_PURCHASE';
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_ledger_topup_purchase ON credit_ledger(reference_id) WHERE reference_id IS NOT NULL AND entry_type = 'TOPUP_PURCHASE';
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_ledger_expiration_excess ON credit_ledger(reference_id) WHERE reference_id IS NOT NULL AND entry_type = 'CREDIT_EXPIRATION_EXCESS';
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_ledger_refund_debit ON credit_ledger(reference_id) WHERE reference_id IS NOT NULL AND entry_type = 'REFUND_DEBIT';

-- 9. Gym Pricing Overrides (Decoupled Economic Valuation Engine)
CREATE TABLE IF NOT EXISTS gym_pricing_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    credit_cost INTEGER NOT NULL CHECK (credit_cost > 0),
    monetary_payout_tomans BIGINT NOT NULL CHECK (monetary_payout_tomans >= 0),
    offpeak_credit_cost INTEGER,
    peak_credit_cost INTEGER,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ DEFAULT NULL,
    created_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pricing_gym_active ON gym_pricing_overrides(gym_id, effective_from, effective_to);

-- 10. Check-ins Table
CREATE TABLE IF NOT EXISTS checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE RESTRICT,
    staff_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    credits_debited INTEGER NOT NULL CHECK (credits_debited > 0),
    monetary_payout_tomans BIGINT NOT NULL CHECK (monetary_payout_tomans >= 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('COMPLETED', 'DISPUTED', 'CANCELLED', 'REJECTED')),
    rejection_reason VARCHAR(100),
    client_lat NUMERIC(10, 8),
    client_lng NUMERIC(11, 8),
    qr_nonce VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_checkins_qr_nonce UNIQUE (qr_nonce)
);
CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_gym ON checkins(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_qr_nonce ON checkins(qr_nonce);
CREATE INDEX IF NOT EXISTS idx_checkins_user_gym_created ON checkins(user_id, gym_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_user_status_created ON checkins(user_id, status, created_at DESC);

-- 11. Gym Payable Ledger (Monetary Liabilities Owed to Gyms in Tomans)
CREATE TABLE IF NOT EXISTS gym_payable_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE RESTRICT,
    checkin_id UUID REFERENCES checkins(id),
    delta_amount_tomans BIGINT NOT NULL,
    balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
    entry_type VARCHAR(40) NOT NULL CHECK (entry_type IN (
        'CHECKIN_EARNING',
        'DISBURSEMENT_PAYA',
        'DISPUTE_ADJUSTMENT',
        'BONUS_INCENTIVE'
    )),
    settlement_id UUID,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gym_payable_gym ON gym_payable_ledger(gym_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gym_payable_checkin_earning ON gym_payable_ledger(checkin_id) WHERE checkin_id IS NOT NULL AND entry_type = 'CHECKIN_EARNING';
CREATE UNIQUE INDEX IF NOT EXISTS uq_gym_payable_settlement_disbursement ON gym_payable_ledger(settlement_id) WHERE settlement_id IS NOT NULL AND entry_type = 'DISBURSEMENT_PAYA';

-- 12. Settlement Batches (Banking & Paya Disbursals)
CREATE TABLE IF NOT EXISTS settlement_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE RESTRICT,
    cycle_start DATE NOT NULL,
    cycle_end DATE NOT NULL,
    total_visits INTEGER NOT NULL CHECK (total_visits >= 0),
    total_amount_tomans BIGINT NOT NULL CHECK (total_amount_tomans >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN (
        'PENDING_APPROVAL',
        'APPROVED_FOR_PAYA',
        'PAID',
        'REJECTED'
    )),
    bank_reference_rrn VARCHAR(100),
    paya_tracking_id VARCHAR(100),
    disbursed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_settlement_batches_gym_cycle UNIQUE (gym_id, cycle_start, cycle_end),
    CONSTRAINT chk_settlement_cycle CHECK (cycle_end >= cycle_start)
);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_gym_cycle ON settlement_batches(gym_id, cycle_start, cycle_end);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_status ON settlement_batches(status);

-- 13. Dynamic System Configuration Key-Value Store
CREATE TABLE IF NOT EXISTS system_configs (
    key VARCHAR(100) PRIMARY KEY,
    value_json JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Audit Log & Security Events
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100),
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);

-- 15. Fraud Alert Events
CREATE TABLE IF NOT EXISTS fraud_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    details JSONB NOT NULL,
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fraud_events_user ON fraud_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_events_gym ON fraud_events(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_events_status ON fraud_events(is_resolved, severity);

-- =============================================================================
-- COACH CLASSES DOMAIN (FIRST-CLASS NATIVE CAPABILITY)
-- =============================================================================

-- 16. Coaches Table (Layered on top of Users)
CREATE TABLE IF NOT EXISTS coaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(150) NOT NULL,
    bio TEXT,
    avatar_url TEXT,
    specialties JSONB NOT NULL DEFAULT '[]'::jsonb,
    sports JSONB NOT NULL DEFAULT '[]'::jsonb,
    experience_years INTEGER NOT NULL DEFAULT 1 CHECK (experience_years >= 0),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'SUSPENDED', 'REJECTED')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sheba_number VARCHAR(26),
    bank_account_holder VARCHAR(150),
    contact_phone VARCHAR(20),
    commission_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1500 CHECK (commission_rate >= 0 AND commission_rate <= 1),
    payable_balance_tomans BIGINT NOT NULL DEFAULT 0 CHECK (payable_balance_tomans >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coaches_user ON coaches(user_id);
CREATE INDEX IF NOT EXISTS idx_coaches_status ON coaches(verification_status, is_active);

-- 17. Class Categories Catalog
CREATE TABLE IF NOT EXISTS class_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) NOT NULL UNIQUE,
    name_fa VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_class_categories_slug ON class_categories(slug);

-- 18. Class Venues (Gravity Gym, Partner Gym, External Gym, Independent, Outdoor, Online)
CREATE TABLE IF NOT EXISTS class_venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_type VARCHAR(30) NOT NULL CHECK (venue_type IN ('GRAVITY_GYM', 'PARTNER_GYM', 'EXTERNAL_GYM', 'INDEPENDENT_VENUE', 'OUTDOOR', 'ONLINE')),
    gym_id UUID REFERENCES gyms(id) ON DELETE SET NULL,
    name_fa VARCHAR(200) NOT NULL,
    city VARCHAR(100) NOT NULL DEFAULT 'تهران',
    district VARCHAR(100),
    address_fa TEXT,
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    online_meeting_url TEXT,
    created_by_coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_class_venues_type ON class_venues(venue_type);
CREATE INDEX IF NOT EXISTS idx_class_venues_city ON class_venues(city, district);

-- 19. Coach Classes (Template Product Offering)
CREATE TABLE IF NOT EXISTS coach_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    category_slug VARCHAR(50) NOT NULL REFERENCES class_categories(slug),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    difficulty VARCHAR(20) NOT NULL DEFAULT 'ALL_LEVELS' CHECK (difficulty IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS')),
    duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
    default_capacity INTEGER NOT NULL DEFAULT 15 CHECK (default_capacity > 0),
    venue_id UUID NOT NULL REFERENCES class_venues(id) ON DELETE RESTRICT,
    single_session_price_tomans BIGINT NOT NULL CHECK (single_session_price_tomans > 0),
    has_monthly_plan BOOLEAN NOT NULL DEFAULT FALSE,
    cancellation_deadline_hours INTEGER NOT NULL DEFAULT 12,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    cover_image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coach_classes_coach ON coach_classes(coach_id, is_active);
CREATE INDEX IF NOT EXISTS idx_coach_classes_category ON coach_classes(category_slug, is_active);
CREATE INDEX IF NOT EXISTS idx_coach_classes_venue ON coach_classes(venue_id);

-- 20. Class Sessions (Actual Scheduled Occurrences)
CREATE TABLE IF NOT EXISTS class_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES coach_classes(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES class_venues(id) ON DELETE RESTRICT,
    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    booked_count INTEGER NOT NULL DEFAULT 0 CHECK (booked_count >= 0 AND booked_count <= capacity),
    price_tomans BIGINT NOT NULL CHECK (price_tomans > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_class_sessions_slot UNIQUE (class_id, session_date, start_time)
);
CREATE INDEX IF NOT EXISTS idx_class_sessions_class_date ON class_sessions(class_id, session_date);
CREATE INDEX IF NOT EXISTS idx_class_sessions_coach_date ON class_sessions(coach_id, session_date);
CREATE INDEX IF NOT EXISTS idx_class_sessions_status ON class_sessions(status, session_date);

-- 21. Coach Monthly Plans (Optional Monthly Subscriptions per Class/Coach)
CREATE TABLE IF NOT EXISTS coach_monthly_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES coach_classes(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    included_sessions INTEGER NOT NULL CHECK (included_sessions > 0),
    price_tomans BIGINT NOT NULL CHECK (price_tomans > 0),
    validity_days INTEGER NOT NULL DEFAULT 30 CHECK (validity_days > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coach_monthly_plans_class ON coach_monthly_plans(class_id, is_active);
CREATE INDEX IF NOT EXISTS idx_coach_monthly_plans_coach ON coach_monthly_plans(coach_id);

-- 22. Coach Plan Enrollments (Purchased Monthly Plans with Quota)
CREATE TABLE IF NOT EXISTS coach_plan_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
    class_id UUID NOT NULL REFERENCES coach_classes(id) ON DELETE RESTRICT,
    plan_id UUID NOT NULL REFERENCES coach_monthly_plans(id) ON DELETE RESTRICT,
    payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    total_sessions INTEGER NOT NULL CHECK (total_sessions > 0),
    used_sessions INTEGER NOT NULL DEFAULT 0 CHECK (used_sessions >= 0),
    remaining_sessions INTEGER NOT NULL CHECK (remaining_sessions >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED', 'EXHAUSTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_enrollment_dates CHECK (expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_user_class ON coach_plan_enrollments(user_id, class_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_expires ON coach_plan_enrollments(expires_at, status);

-- 23. Coach Plan Usage Ledger (Audit Trail of Quota Decrements and Restorations)
CREATE TABLE IF NOT EXISTS coach_plan_usage_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES coach_plan_enrollments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    delta_sessions INTEGER NOT NULL,
    remaining_after INTEGER NOT NULL CHECK (remaining_after >= 0),
    action_type VARCHAR(30) NOT NULL CHECK (action_type IN ('PURCHASE_INITIAL', 'SESSION_BOOKING', 'CANCELLATION_RESTORE', 'ADMIN_ADJUSTMENT', 'EXPIRATION_REVOKE')),
    reference_booking_id UUID,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_enrollment ON coach_plan_usage_ledger(enrollment_id, created_at DESC);

-- 24. Class Bookings (Single Session and Monthly Quota Bookings)
CREATE TABLE IF NOT EXISTS class_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_code VARCHAR(20) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    session_id UUID NOT NULL REFERENCES class_sessions(id) ON DELETE RESTRICT,
    class_id UUID NOT NULL REFERENCES coach_classes(id) ON DELETE RESTRICT,
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
    venue_id UUID NOT NULL REFERENCES class_venues(id) ON DELETE RESTRICT,
    payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('DIRECT_PAYMENT', 'MONTHLY_PLAN_QUOTA')),
    enrollment_id UUID REFERENCES coach_plan_enrollments(id) ON DELETE SET NULL,
    payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
    price_paid_tomans BIGINT NOT NULL DEFAULT 0 CHECK (price_paid_tomans >= 0),
    gravity_commission_tomans BIGINT NOT NULL DEFAULT 0 CHECK (gravity_commission_tomans >= 0),
    coach_earning_tomans BIGINT NOT NULL DEFAULT 0 CHECK (coach_earning_tomans >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'REFUNDED')),
    attendance_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (attendance_status IN ('PENDING', 'ATTENDED', 'NO_SHOW', 'EXCUSED')),
    attended_at TIMESTAMPTZ,
    checkin_token VARCHAR(128),
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_session_active_booking UNIQUE (user_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_class_bookings_user ON class_bookings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_class_bookings_session ON class_bookings(session_id, status);
CREATE INDEX IF NOT EXISTS idx_class_bookings_coach ON class_bookings(coach_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_class_bookings_code ON class_bookings(booking_code);

-- 25. Coach Payable Ledger (Monetary Liabilities Owed to Coaches in Tomans)
CREATE TABLE IF NOT EXISTS coach_payable_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
    delta_amount_tomans BIGINT NOT NULL,
    balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
    entry_type VARCHAR(40) NOT NULL CHECK (entry_type IN ('CLASS_BOOKING_EARNING', 'MONTHLY_PLAN_EARNING', 'DISBURSEMENT_PAYA', 'REFUND_DEDUCTION', 'COMMISSION_ADJUSTMENT', 'BONUS_INCENTIVE')),
    reference_id UUID,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coach_payable_coach ON coach_payable_ledger(coach_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_coach_payable_booking ON coach_payable_ledger(reference_id) WHERE reference_id IS NOT NULL AND entry_type = 'CLASS_BOOKING_EARNING';
CREATE UNIQUE INDEX IF NOT EXISTS uq_coach_payable_plan ON coach_payable_ledger(reference_id) WHERE reference_id IS NOT NULL AND entry_type = 'MONTHLY_PLAN_EARNING';

-- 26. Coach Settlement Batches (Banking & Paya Disbursals for Coaches)
CREATE TABLE IF NOT EXISTS coach_settlement_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
    cycle_start DATE NOT NULL,
    cycle_end DATE NOT NULL,
    total_bookings INTEGER NOT NULL DEFAULT 0 CHECK (total_bookings >= 0),
    total_gross_tomans BIGINT NOT NULL DEFAULT 0 CHECK (total_gross_tomans >= 0),
    total_commission_tomans BIGINT NOT NULL DEFAULT 0 CHECK (total_commission_tomans >= 0),
    total_net_payout_tomans BIGINT NOT NULL CHECK (total_net_payout_tomans >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'APPROVED_FOR_PAYA', 'PAID', 'REJECTED')),
    bank_reference_rrn VARCHAR(100),
    paya_tracking_id VARCHAR(100),
    disbursed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_coach_settlement_cycle UNIQUE (coach_id, cycle_start, cycle_end),
    CONSTRAINT chk_coach_settlement_cycle CHECK (cycle_end >= cycle_start)
);
CREATE INDEX IF NOT EXISTS idx_coach_settlement_cycle ON coach_settlement_batches(coach_id, cycle_start, cycle_end);
CREATE INDEX IF NOT EXISTS idx_coach_settlement_status ON coach_settlement_batches(status);

