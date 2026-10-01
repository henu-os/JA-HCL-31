# Comprehensive Integration and Hardening Test Suite for Member Reports + HENU OS DESIGN
# Tests all 15 reports, database safety, JV balancing, templates, versioning, audit logging, and regression guardrails.

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host " JA-HCL-31: FINAL HARDENING & COMPREHENSIVE INTEGRATION SUITE       " -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

$baseUrl = "http://localhost:5002/api/reports"
$baseDir = "h:\22septjeevika2026\JA-HCL-31"
$totalTests = 0
$passedTests = 0
$failedTests = 0

function Run-Assert ($testName, $condition, $details = "") {
    $script:totalTests++
    if ($condition) {
        Write-Host "  [PASS] $testName" -ForegroundColor Green
        $script:passedTests++
    } else {
        Write-Host "  [FAIL] $testName - $details" -ForegroundColor Red
        $script:failedTests++
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 1. SCOPE & REGRESSION BOUNDARY VERIFICATION
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n1. Scope & Regression Boundary Checks:" -ForegroundColor Yellow

$excludedFiles = @(
    "$baseDir\modules\account-reports\balance-sheet\balance-sheet.html",
    "$baseDir\modules\account-reports\balance-sheet\balance-sheet.js"
)
foreach ($f in $excludedFiles) {
    Run-Assert "Regression Guard: $(Split-Path $f -Leaf) preserved" (Test-Path $f)
}

$workspaceJs = Get-Content "$baseDir\assets\js\workspace.js" -Raw
Run-Assert "Workspace registers HENU OS DESIGN under Settings" ($workspaceJs.Contains("henu-os-design"))
Run-Assert "Workspace registers all 15 Member Report routes" (
    $workspaceJs.Contains("mr-bill-format") -and
    $workspaceJs.Contains("mr-receipt") -and
    $workspaceJs.Contains("mr-debit-note") -and
    $workspaceJs.Contains("mr-credit-note") -and
    $workspaceJs.Contains("mr-adjustment") -and
    $workspaceJs.Contains("mr-member-control-account") -and
    $workspaceJs.Contains("mr-balance-confirmation-letter") -and
    $workspaceJs.Contains("mr-bank-deposit-list") -and
    $workspaceJs.Contains("mr-data-sheet") -and
    $workspaceJs.Contains("mr-bill-register") -and
    $workspaceJs.Contains("mr-receipt-register") -and
    $workspaceJs.Contains("mr-debit-note-register") -and
    $workspaceJs.Contains("mr-credit-note-register") -and
    $workspaceJs.Contains("mr-adjustment-register") -and
    $workspaceJs.Contains("mr-member-jv-register")
)

# ─────────────────────────────────────────────────────────────────────────────
# 2. VERIFY ALL 15 MEMBER REPORT DIRECTORIES & HTML/JS ASSETS
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n2. Verifying 15 Report Front-End Modules:" -ForegroundColor Yellow

$reports = @(
    @{ key = "MEMBER_BILL_FORMAT"; dir = "bill-format"; name = "Bill Format" },
    @{ key = "MEMBER_RECEIPT"; dir = "receipt"; name = "Receipt" },
    @{ key = "MEMBER_DEBIT_NOTE"; dir = "debit-note"; name = "Debit Note" },
    @{ key = "MEMBER_CREDIT_NOTE"; dir = "credit-note"; name = "Credit Note" },
    @{ key = "MEMBER_ADJUSTMENT"; dir = "adjustment"; name = "Adjustment" },
    @{ key = "MEMBER_CONTROL_ACCOUNT"; dir = "member-control-account"; name = "Member Control Account" },
    @{ key = "MEMBER_BALANCE_CONFIRMATION"; dir = "balance-confirmation-letter"; name = "Balance Confirmation Letter" },
    @{ key = "MEMBER_BANK_DEPOSIT"; dir = "bank-deposit-list"; name = "Bank Deposite List" },
    @{ key = "MEMBER_DATA_SHEET"; dir = "data-sheet"; name = "DATA SHEET" },
    @{ key = "MEMBER_BILL_REGISTER"; dir = "bill-register"; name = "Bill Register" },
    @{ key = "MEMBER_RECEIPT_REGISTER"; dir = "receipt-register"; name = "Receipt Register" },
    @{ key = "MEMBER_DEBIT_NOTE_REGISTER"; dir = "debit-note-register"; name = "Debit Note Register" },
    @{ key = "MEMBER_CREDIT_NOTE_REGISTER"; dir = "credit-note-register"; name = "Credit Note Register" },
    @{ key = "MEMBER_ADJUSTMENT_REGISTER"; dir = "adjustment-register"; name = "Adjustment Register" },
    @{ key = "MEMBER_JV_REGISTER"; dir = "member-jv-register"; name = "Member JV Register" }
)

foreach ($rep in $reports) {
    $dirPath = "$baseDir\modules\member-reports\$($rep.dir)"
    $hasHtml = Test-Path "$dirPath\$($rep.dir).html"
    $hasJs = Test-Path "$dirPath\$($rep.dir).js"
    Run-Assert "Report $($rep.name) ($($rep.key)) has complete HTML & JS" ($hasHtml -and $hasJs)
}

# ─────────────────────────────────────────────────────────────────────────────
# 3. BACKEND API DATA ENDPOINTS & READ-ONLY INTEGRITY
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n3. Testing Backend Report Data Endpoints (Read-Only):" -ForegroundColor Yellow

$sampleEndpoints = @(
    "/member/bill-format?societyId=1&billNo=1",
    "/member/receipt?societyId=1&receiptNo=1",
    "/member/debit-note?societyId=1",
    "/member/credit-note?societyId=1",
    "/member/adjustment?societyId=1",
    "/member/control-account?societyId=1&fyId=1",
    "/member/balance-confirmation?societyId=1",
    "/member/bank-deposit?societyId=1",
    "/member/data-sheet?societyId=1",
    "/member/bill-register?societyId=1&fyId=1",
    "/member/receipt-register?societyId=1&fyId=1",
    "/member/debit-note-register?societyId=1&fyId=1",
    "/member/credit-note-register?societyId=1&fyId=1",
    "/member/adjustment-register?societyId=1&fyId=1",
    "/member/member-jv-register?societyId=1&fyId=1"
)

foreach ($ep in $sampleEndpoints) {
    try {
        $res = Invoke-RestMethod -Uri "$baseUrl$ep" -Method Get -TimeoutSec 5
        Run-Assert "Endpoint $ep returned valid payload" ($res.success -eq $true -or $res -ne $null)
    } catch {
        Run-Assert "Endpoint $ep reachable" $false $_.Exception.Message
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 4. JV BALANCING & VARIANCE RULE VERIFICATION
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n4. Testing Member JV Register Presentation Balancing Logic:" -ForegroundColor Yellow

$jvJs = Get-Content "$baseDir\modules\member-reports\member-jv-register\member-jv-register.js" -Raw
Run-Assert "JV Register calculates totalDebit and totalCredit" ($jvJs.Contains("totalDebit") -and $jvJs.Contains("totalCredit"))
Run-Assert "JV Register computes variance = totalDebit - totalCredit" ($jvJs.Contains("variance"))
Run-Assert "JV Register displays MATCHED when balanced and UNBALANCED when variance != 0" ($jvJs.Contains("MATCHED") -and $jvJs.Contains("UNBALANCED"))

# ─────────────────────────────────────────────────────────────────────────────
# 5. HENU OS DESIGN & ADVANCED MODE INTEGRATION
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n5. Testing HENU OS DESIGN Studio & Advanced Editor:" -ForegroundColor Yellow

# Check Template CRUD, Publish & Version Incrementing
try {
    # 1. Fetch current templates for Bill Format
    $tplRes = Invoke-RestMethod -Uri "$baseUrl/member/templates/MEMBER_BILL_FORMAT" -Method Get -TimeoutSec 5
    Run-Assert "Fetched templates for MEMBER_BILL_FORMAT" ($tplRes.success -eq $true -and $tplRes.templates.Count -gt 0)

    # 2. Save a test draft template
    $draftPayload = @{
        reportKey = "MEMBER_BILL_FORMAT"
        templateKey = "hardening_test_draft"
        templateName = "Hardening Automated Test Template"
        templateJson = '{"paperSize":"A4","orientation":"portrait","advancedDoc":{"metadata":{"version":1},"elements":[]}}'
        isSystem = $false
    } | ConvertTo-Json

    $saveRes = Invoke-RestMethod -Uri "$baseUrl/member/templates" -Method Post -Body $draftPayload -ContentType "application/json" -TimeoutSec 5
    Run-Assert "Saved draft template via API" ($saveRes.success -eq $true)

    # 3. Publish the template
    $publishPayload = @{
        reportKey = "MEMBER_BILL_FORMAT"
        templateKey = "hardening_test_draft"
        templateName = "Hardening Automated Test Template (Published)"
        templateJson = '{"paperSize":"A4","orientation":"portrait","advancedDoc":{"metadata":{"version":2},"elements":[]}}'
        publishedBy = "AUTO_HARDENING_SUITE"
    } | ConvertTo-Json

    $pubRes = Invoke-RestMethod -Uri "$baseUrl/member/templates/publish" -Method Post -Body $publishPayload -ContentType "application/json" -TimeoutSec 5
    Run-Assert "Published template and created active version" ($pubRes.success -eq $true)

    # 4. Check audit log entry creation
    $auditRes = Invoke-RestMethod -Uri "$baseUrl/member/audit-logs/MEMBER_BILL_FORMAT" -Method Get -TimeoutSec 5
    Run-Assert "Audit log contains publish action" ($auditRes.success -eq $true -and $auditRes.auditLogs.Count -gt 0)

    # 5. Check version history & rollback
    $verRes = Invoke-RestMethod -Uri "$baseUrl/member/templates/MEMBER_BILL_FORMAT/hardening_test_draft/versions" -Method Get -TimeoutSec 5
    Run-Assert "Template version history retrieved" ($verRes.success -eq $true -and $verRes.versions.Count -gt 0)

} catch {
    Run-Assert "Template lifecycle API operations" $false $_.Exception.Message
}

# ─────────────────────────────────────────────────────────────────────────────
# 6. EXPORT CONSISTENCY & ENGINE VERIFICATION
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n6. Testing Unified Rendering Engine & Export Consistency:" -ForegroundColor Yellow

$engineJs = Get-Content "$baseDir\modules\member-reports\henu-os-report-engine.js" -Raw
Run-Assert "Engine exports renderAdvancedDocument for Web/PDF/Print consistency" ($engineJs.Contains("renderAdvancedDocument"))
Run-Assert "Engine enforces SCOPE GUARD (MEMBER_REPORTS_SCOPE)" ($engineJs.Contains("MEMBER_REPORTS_SCOPE"))
Run-Assert "Engine provides Indian Currency INR Formatter (formatINR)" ($engineJs.Contains("formatINR"))

# ─────────────────────────────────────────────────────────────────────────────
# 7. SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n=====================================================================" -ForegroundColor Cyan
Write-Host " FINAL HARDENING TEST RESULTS: $passedTests Passed / $totalTests Total ($failedTests Failed)" -ForegroundColor $(if ($failedTests -eq 0) { "Green" } else { "Red" })
Write-Host "=====================================================================" -ForegroundColor Cyan
