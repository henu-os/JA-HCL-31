# ═══════════════════════════════════════════════════════════
# verify_design_studio.ps1 — Test Suite for HENU OS DESIGN APIs
# ═══════════════════════════════════════════════════════════

$baseUrl = "http://localhost:5002/api/reports/member"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  EXECUTING TEST SUITE FOR HENU OS DESIGN STUDIO" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$passed = 0
$failed = 0

# Test 1: Get All 18 Report Definitions
try {
    $defs = Invoke-RestMethod -Uri "$baseUrl/definitions" -Method Get
    if ($defs.success -eq $true -and $defs.definitions.Count -ge 18) {
        Write-Host "[PASS] Get Report Definitions -> Found $($defs.definitions.Count) report definitions (All 18 items)" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "[FAIL] Get Report Definitions count was $($defs.definitions.Count)" -ForegroundColor Red
        $failed++
    }
} catch {
    Write-Host "[FAIL] Get Report Definitions: $_" -ForegroundColor Red
    $failed++
}

# Test 2: Save Draft Template
try {
    $body = @{
        reportKey = "MEMBER_BILL_FORMAT"
        templateKey = "test_draft"
        templateName = "Automated Test Draft Template"
        templateJson = '{"primaryColor":"#6366f1","paletteId":"modern_indigo_clay"}'
        isSystem = $false
    } | ConvertTo-Json

    $saveRes = Invoke-RestMethod -Uri "$baseUrl/templates" -Method Post -Body $body -ContentType "application/json"
    if ($saveRes.success -eq $true) {
        Write-Host "[PASS] Save Draft Template -> success" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "[FAIL] Save Draft Template" -ForegroundColor Red
        $failed++
    }
} catch {
    Write-Host "[FAIL] Save Draft Template: $_" -ForegroundColor Red
    $failed++
}

# Test 3: Publish Template as Active
try {
    $pubBody = @{
        reportKey = "MEMBER_BILL_FORMAT"
        templateKey = "test_draft"
        templateName = "Automated Test Draft Template"
        templateJson = '{"primaryColor":"#6366f1","paletteId":"modern_indigo_clay"}'
        publishedBy = "ADMIN"
    } | ConvertTo-Json

    $pubRes = Invoke-RestMethod -Uri "$baseUrl/templates/publish" -Method Post -Body $pubBody -ContentType "application/json"
    if ($pubRes.success -eq $true) {
        Write-Host "[PASS] Publish Template as Active -> $($pubRes.message)" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "[FAIL] Publish Template" -ForegroundColor Red
        $failed++
    }
} catch {
    Write-Host "[FAIL] Publish Template: $_" -ForegroundColor Red
    $failed++
}

# Test 4: Duplicate Template
try {
    $dupBody = @{
        reportKey = "MEMBER_BILL_FORMAT"
        sourceTemplateKey = "test_draft"
        newTemplateKey = "test_draft_copy"
        newTemplateName = "Automated Test Draft Copy"
        createdBy = "ADMIN"
    } | ConvertTo-Json

    $dupRes = Invoke-RestMethod -Uri "$baseUrl/templates/duplicate" -Method Post -Body $dupBody -ContentType "application/json"
    if ($dupRes.success -eq $true) {
        Write-Host "[PASS] Duplicate Template -> $($dupRes.message)" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "[FAIL] Duplicate Template" -ForegroundColor Red
        $failed++
    }
} catch {
    Write-Host "[FAIL] Duplicate Template: $_" -ForegroundColor Red
    $failed++
}

# Test 5: Get Template Versions
try {
    $vRes = Invoke-RestMethod -Uri "$baseUrl/templates/MEMBER_BILL_FORMAT/test_draft/versions" -Method Get
    if ($vRes.success -eq $true -and $vRes.versions.Count -ge 1) {
        Write-Host "[PASS] Get Template Versions -> Found $($vRes.versions.Count) versions" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "[FAIL] Get Template Versions" -ForegroundColor Red
        $failed++
    }
} catch {
    Write-Host "[FAIL] Get Template Versions: $_" -ForegroundColor Red
    $failed++
}

# Test 6: Audit Logs
try {
    $aRes = Invoke-RestMethod -Uri "$baseUrl/audit-logs/MEMBER_BILL_FORMAT" -Method Get
    if ($aRes.success -eq $true -and $aRes.auditLogs.Count -ge 1) {
        Write-Host "[PASS] Audit Logs -> Logged $($aRes.auditLogs.Count) configuration actions" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "[FAIL] Audit Logs" -ForegroundColor Red
        $failed++
    }
} catch {
    Write-Host "[FAIL] Audit Logs: $_" -ForegroundColor Red
    $failed++
}

# Test 7: Delete Custom Template
try {
    $delRes = Invoke-RestMethod -Uri "$baseUrl/templates/MEMBER_BILL_FORMAT/test_draft_copy" -Method Delete
    if ($delRes.success -eq $true) {
        Write-Host "[PASS] Delete Custom Template -> $($delRes.message)" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "[FAIL] Delete Custom Template" -ForegroundColor Red
        $failed++
    }
} catch {
    Write-Host "[FAIL] Delete Custom Template: $_" -ForegroundColor Red
    $failed++
}

Write-Host "--------------------------------------------------------"
$color = if ($failed -eq 0) { "Green" } else { "Red" }
Write-Host "STUDIO TOTAL: 7 | PASSED: $passed | FAILED: $failed" -ForegroundColor $color
Write-Host "========================================================" -ForegroundColor Cyan
