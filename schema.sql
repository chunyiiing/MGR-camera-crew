-- ═══════════════════════════════════════════════════════════════════
-- 攝影器材管理系統 — Supabase SQL Schema
-- 執行方式：Supabase Dashboard → SQL Editor → 貼入並執行
-- ═══════════════════════════════════════════════════════════════════

-- ─── 擴充功能 ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 1. 器材主表 (equipments) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipments (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name        TEXT NOT NULL,                        -- 器材名稱
  code        TEXT UNIQUE NOT NULL,                 -- 器材編號 (QR Code 識別碼，如 A-001)
  category    TEXT DEFAULT 'general',               -- 分類 (camera/lens/light/general)
  total_qty   INTEGER DEFAULT 1 CHECK (total_qty >= 0),
  rented_qty  INTEGER DEFAULT 0 CHECK (rented_qty >= 0),
  repair_qty  INTEGER DEFAULT 0 CHECK (repair_qty >= 0),
  status      TEXT DEFAULT 'available'
              CHECK (status IN ('available','rented','repair','retired')),
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. 出租記錄表 (rentals) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS rentals (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  equipment_name   TEXT NOT NULL,
  equipment_code   TEXT NOT NULL,
  user_name        TEXT NOT NULL,
  order_no         TEXT,                            -- 單號 (可空)
  checkout_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  checkout_time    TIMESTAMPTZ DEFAULT NOW(),
  expected_return  DATE,                            -- 預計歸還日 (可選)
  returned_at      TIMESTAMPTZ,
  status           TEXT DEFAULT 'rented'
                   CHECK (status IN ('rented','returned','partial','overdue')),
  note             TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. 使用者表 (users) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  role        TEXT DEFAULT 'member'
              CHECK (role IN ('admin','member')),
  is_default  BOOLEAN DEFAULT FALSE,               -- 預設下拉選單成員
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 4. 器材狀態記錄表 (status_logs) ─────────────────────────────
CREATE TABLE IF NOT EXISTS status_logs (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  equipment_name   TEXT NOT NULL,
  equipment_code   TEXT NOT NULL,
  user_name        TEXT NOT NULL,                  -- 填寫人
  status           TEXT DEFAULT 'normal'
                   CHECK (status IN ('normal','pending','repair')),
  log_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  note             TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 5. 入庫記錄表 (inbound_logs) ────────────────────────────────
CREATE TABLE IF NOT EXISTS inbound_logs (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  equipment_name   TEXT NOT NULL,
  equipment_code   TEXT NOT NULL,
  quantity         INTEGER DEFAULT 1,
  user_name        TEXT,                           -- 入庫操作人
  note             TEXT,
  inbound_date     DATE DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════
-- 索引 (提升查詢效能)
-- ═══════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_equipments_code   ON equipments(code);
CREATE INDEX IF NOT EXISTS idx_equipments_status ON equipments(status);
CREATE INDEX IF NOT EXISTS idx_rentals_code       ON rentals(equipment_code);
CREATE INDEX IF NOT EXISTS idx_rentals_status     ON rentals(status);
CREATE INDEX IF NOT EXISTS idx_rentals_date       ON rentals(checkout_date);
CREATE INDEX IF NOT EXISTS idx_status_logs_code   ON status_logs(equipment_code);
CREATE INDEX IF NOT EXISTS idx_status_logs_date   ON status_logs(log_date);

-- ═══════════════════════════════════════════════════════════════════
-- 自動更新 updated_at
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_equipments_updated_at
  BEFORE UPDATE ON equipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- 自動同步 rented_qty（當 rental 狀態改為 returned 時）
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION sync_equipment_qty()
RETURNS TRIGGER AS $$
BEGIN
  -- 新增出租：rented_qty +1
  IF TG_OP = 'INSERT' AND NEW.status = 'rented' THEN
    UPDATE equipments
    SET rented_qty = rented_qty + 1,
        status = 'rented'
    WHERE code = NEW.equipment_code;

  -- 改為 returned：rented_qty -1
  ELSIF TG_OP = 'UPDATE'
    AND OLD.status = 'rented'
    AND NEW.status = 'returned' THEN

    UPDATE equipments
    SET rented_qty = GREATEST(0, rented_qty - 1)
    WHERE code = NEW.equipment_code;

    -- 若 rented_qty 歸零，自動回 available
    UPDATE equipments
    SET status = 'available'
    WHERE code = NEW.equipment_code
      AND rented_qty = 0
      AND repair_qty = 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rental_qty_sync
  AFTER INSERT OR UPDATE ON rentals
  FOR EACH ROW EXECUTE FUNCTION sync_equipment_qty();

-- ═══════════════════════════════════════════════════════════════════
-- 初始資料 — 9 位預設使用者
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO users (name, is_default) VALUES
  ('崇瑋', TRUE),
  ('得生', TRUE),
  ('純穎', TRUE),
  ('哲嘉', TRUE),
  ('子禎', TRUE),
  ('錢琦', TRUE),
  ('致瑋', TRUE),
  ('家暉', TRUE),
  ('冠智', TRUE)
ON CONFLICT (name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- Row Level Security (RLS) — 可視需求開啟
-- ═══════════════════════════════════════════════════════════════════
-- 若使用 Supabase Auth，可取消下方註解啟用 RLS：
/*
ALTER TABLE equipments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_logs ENABLE ROW LEVEL SECURITY;

-- 允許所有已驗證用戶讀取
CREATE POLICY "Allow read for authenticated" ON equipments
  FOR SELECT TO authenticated USING (true);

-- 允許所有已驗證用戶寫入（依需求收緊）
CREATE POLICY "Allow write for authenticated" ON equipments
  FOR ALL TO authenticated USING (true);
*/

-- ═══════════════════════════════════════════════════════════════════
-- 盤點 VIEW（可選，方便前端查詢）
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW inventory_summary AS
SELECT
  e.id,
  e.name,
  e.code,
  e.category,
  e.total_qty,
  e.repair_qty,
  e.rented_qty,
  e.total_qty - e.repair_qty - e.rented_qty AS should_be_present,
  e.status,
  COUNT(r.id) FILTER (WHERE r.status = 'rented') AS active_rentals
FROM equipments e
LEFT JOIN rentals r ON r.equipment_code = e.code
GROUP BY e.id;

-- ═══════════════════════════════════════════════════════════════════
-- 範例器材資料（可選，用於測試）
-- ═══════════════════════════════════════════════════════════════════
/*
INSERT INTO equipments (name, code, category, total_qty) VALUES
  ('Sony A7 IV 機身',  'CAM-001', 'camera', 3),
  ('Sony A7 IV 機身',  'CAM-002', 'camera', 1),
  ('Canon EOS R5',     'CAM-003', 'camera', 2),
  ('Sony 24-70mm GM',  'LEN-001', 'lens',   2),
  ('Sony 70-200mm GM', 'LEN-002', 'lens',   2),
  ('Godox SL-150W',    'LIT-001', 'light',  4),
  ('Manfrotto 三腳架', 'ACC-001', 'general',3)
ON CONFLICT (code) DO NOTHING;
*/
