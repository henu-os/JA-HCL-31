-- ═══════════════════════════════════════════════════════════
-- JEEVIKA ERP v2 — SQLITE MIGRATION V2: OPTIONAL SYNCHRONIZATION FOUNDATION
-- Location: Database/Local/migrations/V2__sync_foundation.sql
-- ═══════════════════════════════════════════════════════════

PRAGMA foreign_keys = ON;

-- 1. Sync Batches Tracking Table
CREATE TABLE IF NOT EXISTS SyncBatch (
    BatchId         TEXT PRIMARY KEY,
    SourceNodeId    TEXT NOT NULL,
    TargetNodeId    TEXT,
    SocietyId       INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId            INTEGER REFERENCES FinancialYear(FYId) ON DELETE SET NULL,
    FormatVersion   TEXT NOT NULL DEFAULT '1.0.0',
    Scope           TEXT NOT NULL DEFAULT 'SOCIETY',
    ChecksumSha256  TEXT NOT NULL,
    TotalChanges    INTEGER NOT NULL DEFAULT 0,
    Status          TEXT NOT NULL DEFAULT 'Pending',
    ErrorMessage    TEXT,
    CreatedAt       TEXT DEFAULT (datetime('now')),
    AppliedAt       TEXT,
    CreatedBy       TEXT
);
CREATE INDEX IF NOT EXISTS idx_syncbatch_soc_status ON SyncBatch(SocietyId, Status);
CREATE INDEX IF NOT EXISTS idx_syncbatch_created ON SyncBatch(CreatedAt);

-- 2. Sync Change Log Table
CREATE TABLE IF NOT EXISTS SyncChangeLog (
    ChangeId        INTEGER PRIMARY KEY AUTOINCREMENT,
    BatchId         TEXT NOT NULL REFERENCES SyncBatch(BatchId) ON DELETE CASCADE,
    SocietyId       INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    EntityType      TEXT NOT NULL,
    EntityKey       TEXT NOT NULL,
    Action          TEXT NOT NULL,
    PayloadJson     TEXT NOT NULL,
    ChangeTimestamp TEXT DEFAULT (datetime('now')),
    AppliedStatus   TEXT DEFAULT 'Pending',
    ConflictReason  TEXT
);
CREATE INDEX IF NOT EXISTS idx_syncchange_batch ON SyncChangeLog(BatchId, EntityType);
CREATE INDEX IF NOT EXISTS idx_syncchange_entity ON SyncChangeLog(SocietyId, EntityType, EntityKey);

-- 3. Sync Audit Log Table
CREATE TABLE IF NOT EXISTS SyncAuditLog (
    AuditId         INTEGER PRIMARY KEY AUTOINCREMENT,
    BatchId         TEXT REFERENCES SyncBatch(BatchId) ON DELETE SET NULL,
    SocietyId       INTEGER,
    Action          TEXT NOT NULL,
    Status          TEXT NOT NULL,
    Details         TEXT,
    ExecutedBy      TEXT,
    CreatedAt       TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_syncaudit_batch ON SyncAuditLog(BatchId);
CREATE INDEX IF NOT EXISTS idx_syncaudit_created ON SyncAuditLog(CreatedAt);
