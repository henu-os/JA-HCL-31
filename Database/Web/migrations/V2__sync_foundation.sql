-- ═══════════════════════════════════════════════════════════
-- JEEVIKA ERP v2 — POSTGRESQL MIGRATION V2: OPTIONAL SYNCHRONIZATION FOUNDATION
-- Location: Database/Web/migrations/V2__sync_foundation.sql
-- ═══════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS jeevika_erp;
SET search_path TO jeevika_erp, public;

-- 1. Sync Batches Tracking Table
CREATE TABLE IF NOT EXISTS jeevika_erp.SyncBatch (
    BatchId         VARCHAR(64) PRIMARY KEY,
    SourceNodeId    VARCHAR(100) NOT NULL,
    TargetNodeId    VARCHAR(100),
    SocietyId       INT NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId            INT REFERENCES jeevika_erp.FinancialYear(FYId) ON DELETE SET NULL,
    FormatVersion   VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    Scope           VARCHAR(50) NOT NULL DEFAULT 'SOCIETY',
    ChecksumSha256  VARCHAR(64) NOT NULL,
    TotalChanges    INT NOT NULL DEFAULT 0,
    Status          VARCHAR(50) NOT NULL DEFAULT 'Pending',
    ErrorMessage    TEXT,
    CreatedAt       TIMESTAMPTZ DEFAULT NOW(),
    AppliedAt       TIMESTAMPTZ,
    CreatedBy       VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS idx_syncbatch_soc_status ON jeevika_erp.SyncBatch(SocietyId, Status);
CREATE INDEX IF NOT EXISTS idx_syncbatch_created ON jeevika_erp.SyncBatch(CreatedAt);

-- 2. Sync Change Log Table
CREATE TABLE IF NOT EXISTS jeevika_erp.SyncChangeLog (
    ChangeId        SERIAL PRIMARY KEY,
    BatchId         VARCHAR(64) NOT NULL REFERENCES jeevika_erp.SyncBatch(BatchId) ON DELETE CASCADE,
    SocietyId       INT NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    EntityType      VARCHAR(100) NOT NULL,
    EntityKey       VARCHAR(100) NOT NULL,
    Action          VARCHAR(20) NOT NULL,
    PayloadJson     TEXT NOT NULL,
    ChangeTimestamp TIMESTAMPTZ DEFAULT NOW(),
    AppliedStatus   VARCHAR(50) DEFAULT 'Pending',
    ConflictReason  TEXT
);
CREATE INDEX IF NOT EXISTS idx_syncchange_batch ON jeevika_erp.SyncChangeLog(BatchId, EntityType);
CREATE INDEX IF NOT EXISTS idx_syncchange_entity ON jeevika_erp.SyncChangeLog(SocietyId, EntityType, EntityKey);

-- 3. Sync Audit Log Table
CREATE TABLE IF NOT EXISTS jeevika_erp.SyncAuditLog (
    AuditId         SERIAL PRIMARY KEY,
    BatchId         VARCHAR(64) REFERENCES jeevika_erp.SyncBatch(BatchId) ON DELETE SET NULL,
    SocietyId       INT,
    Action          VARCHAR(100) NOT NULL,
    Status          VARCHAR(50) NOT NULL,
    Details         TEXT,
    ExecutedBy      VARCHAR(100),
    CreatedAt       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_syncaudit_batch ON jeevika_erp.SyncAuditLog(BatchId);
CREATE INDEX IF NOT EXISTS idx_syncaudit_created ON jeevika_erp.SyncAuditLog(CreatedAt);
