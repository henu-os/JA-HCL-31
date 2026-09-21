# Shared Data Dictionary & Domain Entities

## Entity Summary
Jeevika ERP 2.0 maintains 30 core database entities across both PostgreSQL and SQLite:

1. **`SoftUser`**: Authentication, roles, and administrative users.
2. **`SocietyInfo`**: Housing society registration, committee, bank, and GST profile.
3. **`FinancialYear`**: Fiscal year date boundaries (e.g. `2025-04-01` to `2026-03-31`).
4. **`TxNumberConfig`**: Sequential voucher numbering rules scoped by `SocietyId + FYId + VoucherType`.
5. **`SocGroup`**: Chart of accounts grouping (Asset, Liability, Income, Expense).
6. **`SocAccount`**: Ledger accounts with opening and closing balances.
7. **`SocMember`**: Member unit roster, flat details, shares, nominees, tenant lease, liens, transfers.
8. **`SocVendor`**: Creditor vendor roster, contracts, GSTIN, TDS section.
9. **`SocStaff`**: Society employees, salaries, TDS, PF, ESIC.
10. **`SocCommittee`**: Managing committee board members and roles.
11. **`SocBillType`**: Billing classifications (Maintenance, Festival, Sinking, etc.).
12. **`SocBillingMatrix`**: Pre-configured billing head amounts per member.
13. **`SocBillingSetting`**: Automated GST and interest calculation settings.
14. **`SocOpeningBankReco`**: Opening uncleared cheques for bank reconciliation.
15. **`SocVoucherHeader`**: Transaction headers (Payment, Receipt, Journal, Contra, Other Receipt).
16. **`SocVoucherDetail`**: Line-item ledger entries enforcing $\sum \text{Dr} = \sum \text{Cr}$.
17. **`SocMemberBill`**: Generated member maintenance invoices.
18. **`SocMemberBillItem`**: Individual head breakdown for member bills.
19. **`SocMemberNote`**: Credit notes and debit notes.
20. **`SocOpeningBalance`**: Historical opening ledger balances.
21. **`SocFixedDeposit`**: Society term deposits and accrued interest.
22. **`SocMemberTransfer`**: Unit ownership transfer history.
23. **`SocMemberLien`**: Bank loan mortgage lien markings.
24. **`SocMemberTenant`**: Tenant police verification and lease roster.
25. **`SocMemberNominee`**: Member nominee shares and relationships.
26. **`SocMemberBillOverride`**: Custom flat-specific ledger billing overrides.
27. **`SocBillTypeHead`**: Account ledger linkages per bill type.
28. **`SocBillTypeNote`**: Interest calculation rules (M-CM, Simple, 21%) and payment instructions.
29. **`AuditLog`**: Immutable security and transaction audit trail.
30. **`schema_migrations`**: Database migration execution history and checksum audit.
