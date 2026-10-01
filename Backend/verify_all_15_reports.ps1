# ═══════════════════════════════════════════════════════════
# verify_all_15_reports.ps1 — Automated Test Suite for 15 Member Reports
# ═══════════════════════════════════════════════════════════

$baseUrl = "http://localhost:5002/api/reports/member"
$endpoints = @(
    @{ Name = "Report 1: Bill Format"; Endpoint = "$baseUrl/bill-format?societyId=1" },
    @{ Name = "Report 2: Receipt"; Endpoint = "$baseUrl/receipt?societyId=1" },
    @{ Name = "Report 3: Debit Note"; Endpoint = "$baseUrl/debit-note?societyId=1" },
    @{ Name = "Report 4: Credit Note"; Endpoint = "$baseUrl/credit-note?societyId=1" },
    @{ Name = "Report 5: Adjustment"; Endpoint = "$baseUrl/adjustment?societyId=1" },
    @{ Name = "Report 6: Member Control Account"; Endpoint = "$baseUrl/member-control-account?societyId=1" },
    @{ Name = "Report 7: Balance Confirmation Letter"; Endpoint = "$baseUrl/balance-confirmation?societyId=1" },
    @{ Name = "Report 8: Bank Deposit List"; Endpoint = "$baseUrl/bank-deposit?societyId=1" },
    @{ Name = "Report 9: Data Sheet"; Endpoint = "$baseUrl/data-sheet?societyId=1" },
    @{ Name = "Report 10: Bill Register"; Endpoint = "$baseUrl/bill-register?societyId=1" },
    @{ Name = "Report 11: Receipt Register"; Endpoint = "$baseUrl/receipt-register?societyId=1" },
    @{ Name = "Report 12: Debit Note Register"; Endpoint = "$baseUrl/debit-note-register?societyId=1" },
    @{ Name = "Report 13: Credit Note Register"; Endpoint = "$baseUrl/credit-note-register?societyId=1" },
    @{ Name = "Report 14: Adjustment Register"; Endpoint = "$baseUrl/adjustment-register?societyId=1" },
    @{ Name = "Report 15: Member JV Register"; Endpoint = "$baseUrl/member-jv-register?societyId=1" }
)

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  EXECUTING COMPREHENSIVE TEST SUITE FOR 15 MEMBER REPORTS" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$passed = 0
$failed = 0

foreach ($test in $endpoints) {
    try {
        $res = Invoke-RestMethod -Uri $test.Endpoint -Method Get -TimeoutSec 10
        if ($res.success -eq $true) {
            Write-Host "[PASS] $($test.Name) -> $($res.reportKey)" -ForegroundColor Green
            $passed++
        } else {
            Write-Host "[FAIL] $($test.Name) -> Response success was not true" -ForegroundColor Red
            $failed++
        }
    } catch {
        Write-Host "[FAIL] $($test.Name) -> Error: $_" -ForegroundColor Red
        $failed++
    }
}

$color = if ($failed -eq 0) { "Green" } else { "Red" }
Write-Host "TOTAL: $($endpoints.Count) | PASSED: $passed | FAILED: $failed" -ForegroundColor $color
Write-Host "========================================================" -ForegroundColor Cyan
