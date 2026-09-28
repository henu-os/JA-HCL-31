# SOCIETY EXPORT / IMPORT PACKAGE TECHNICAL DESIGN (DESIGN ONLY)

**Project:** JEEVIKA ERP 2.0  
**Phase:** Phase 2  
**Purpose:** Technical Specification for Society-Level Portable Data Transfer & Merging.

---

## 1. Objectives

1. **Standalone Export:** Enable Laptop A to export an entire society (e.g. Society ID 1) with all historical financial years, masters, ledgers, bills, and vouchers into an immutable `.jeevika.pkg` (ZIP containing encrypted JSON / SQLite snapshot).
2. **Clean Restore:** Enable Laptop B (empty database) to import the package and restore the society seamlessly.
3. **Safe Merge:** Enable Laptop C (which already has existing societies) to import the package without primary key collisions and without overwriting existing societies.

---

## 2. Dependency Insertion Topology

To guarantee referential integrity during import, records must be inserted in the following strict order:

```
Step 1: SocietyInfo (Generates New_SocietyId)
Step 2: FinancialYear (Mapped with New_SocietyId -> Generates New_FYId map)
Step 3: SocGroup (Mapped with New_SocietyId -> Generates New_GroupId map)
Step 4: SocAccount (Mapped with New_SocietyId & New_GroupId -> Generates New_AccountId map)
Step 5: SocMember (Mapped with New_SocietyId -> Generates New_MemberId map)
  ├── SocMemberNominee (Mapped with New_MemberId)
  ├── SocMemberTenant (Mapped with New_MemberId)
  ├── SocMemberLien (Mapped with New_MemberId)
  └── SocMemberTransfer (Mapped with New_MemberId)
Step 6: SocVendor, SocStaff, SocCommittee (Mapped with New_SocietyId)
Step 7: SocBillType, SocBillTypeHead, SocBillTypeNote (Mapped with New_SocietyId & New_AccountId)
Step 8: SocBillingMatrix, SocBillingSetting (Mapped with New_SocietyId, New_BillTypeId, New_MemberId)
Step 9: SocOpeningBalance, SocOpeningBankReco (Mapped with New_SocietyId, New_FYId, New_AccountId)
Step 10: SocVoucherHeader (Mapped with New_SocietyId & New_FYId -> Generates New_VoucherId map)
  └── SocVoucherDetail (Mapped with New_VoucherId & New_AccountId)
Step 11: SocMemberBill (Mapped with New_SocietyId, New_FYId, New_MemberId, New_BillTypeId)
  └── SocMemberBillItem (Mapped with New_BillId)
Step 12: SocMemberNote, SocFixedDeposit
```

---

## 3. Key Conflict Resolution Strategy

When importing into a database that already contains records:
- **Foreign Key Re-mapping:** Never reuse source integer IDs directly. Generate an in-memory lookup `Dictionary<int, int>` for each entity type during import.
- **Duplicate Code Collision:** If a `SocietyCode` (e.g. `SRS001`) already exists on the target machine, prompt the operator to choose a unique target code (e.g. `SRS001_IMPORTED`) while preserving the legal society name and registration number.
