-- ═══════════════════════════════════════════════════════════
-- JEEVIKA ERP v2 — LOCAL SQLITE SEED DATA
-- Location: Database/Local/seeds/sqlite_seed.sql
-- ═══════════════════════════════════════════════════════════

INSERT OR IGNORE INTO SocietyInfo (
    SocietyCode, SocietyName, SocMarName,
    Address, City, Pincode, Phone, Email,
    RegistrationNo, PANNumber, GSTApplicable,
    ChairmanName, SecretaryName, TreasurerName,
    BankName, BankAccountNo, BankBranch, IFSCCode,
    IsActive, CreatedAt
)
VALUES (
    'SRS001', 'Sai Ram Society', 'सई राम सोसायटी',
    '123 Sai Nagar, Kandivali West', 'Mumbai', '400067', '9869045370', 'sairam@society.com',
    'MH/MUM/HSG/SR001', 'AABCS1234D', 0,
    'Ramesh Sharma', 'Suresh Patil', 'Mahesh Joshi',
    'State Bank of India', '12345678901', 'Kandivali West', 'SBIN0001234',
    1, datetime('now')
);

INSERT OR IGNORE INTO FinancialYear (
    SocietyId, FYLabel, FYStart, FYEnd, IsActive, IsClosed
)
SELECT
    s.SocietyId,
    '2025-26',
    '2025-04-01',
    '2026-03-31',
    1,
    0
FROM SocietyInfo s
WHERE s.SocietyCode = 'SRS001';
