-- ═══════════════════════════════════════════════════════════
-- JEEVIKA ERP v2 — WEB POSTGRESQL SEED DATA
-- Location: Database/Web/seeds/seed.sql
-- ═══════════════════════════════════════════════════════════

SET search_path TO jeevika_erp, public;

-- ── Sample Society ─────────────────────────────────────────
INSERT INTO jeevika_erp.SocietyInfo (
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
    'MH/MUM/HSG/SR001', 'AABCS1234D', FALSE,
    'Ramesh Sharma', 'Suresh Patil', 'Mahesh Joshi',
    'State Bank of India', '12345678901', 'Kandivali West', 'SBIN0001234',
    TRUE, NOW()
)
ON CONFLICT (SocietyCode) DO NOTHING;

-- ── Financial Year for that society ───────────────────────
INSERT INTO jeevika_erp.FinancialYear (
    SocietyId, FYLabel, FYStart, FYEnd, IsActive, IsClosed
)
SELECT
    s.SocietyId,
    '2025-26',
    '2025-04-01'::DATE,
    '2026-03-31'::DATE,
    TRUE,
    FALSE
FROM jeevika_erp.SocietyInfo s
WHERE s.SocietyCode = 'SRS001'
ON CONFLICT (SocietyId, FYLabel) DO NOTHING;
