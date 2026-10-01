# PowerShell Test Suite for HENU OS DESIGN -> ADVANCED MODE

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " HENU OS DESIGN -> ADVANCED MODE VERIFICATION SUITE       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$baseDir = "h:\22septjeevika2026\JA-HCL-31"
$passed = 0
$failed = 0

function Assert-Check ($name, $condition) {
    if ($condition) {
        Write-Host "  [PASS] $name" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "  [FAIL] $name" -ForegroundColor Red
        $script:failed++
    }
}

# 1. Check File Existence
Assert-Check "henu-os-advanced-editor.js exists" (Test-Path "$baseDir\modules\settings\henu-os-design\henu-os-advanced-editor.js")
Assert-Check "henu-os-advanced-editor.css exists" (Test-Path "$baseDir\modules\settings\henu-os-design\henu-os-advanced-editor.css")
Assert-Check "henu-os-design.html exists" (Test-Path "$baseDir\modules\settings\henu-os-design\henu-os-design.html")

# 2. Check JS Content & Schema
$jsContent = Get-Content "$baseDir\modules\settings\henu-os-design\henu-os-advanced-editor.js" -Raw
Assert-Check "Contains SCHEMA_REGISTRY for safe tokens" ($jsContent.Contains("SCHEMA_REGISTRY"))
Assert-Check "Contains SAMPLE_DATA_STORE for test data" ($jsContent.Contains("SAMPLE_DATA_STORE"))
Assert-Check "Contains 8-handle transform system" ($jsContent.Contains("hoa-handle"))
Assert-Check "Contains alignment and distribution actions" ($jsContent.Contains("alignElements"))
Assert-Check "Contains design validation engine" ($jsContent.Contains("runValidation"))
Assert-Check "Contains Undo/Redo history stack" ($jsContent.Contains("historyStack"))
Assert-Check "Contains Table column inspector" ($jsContent.Contains("tableConfig"))

# 3. Check HTML Links
$htmlContent = Get-Content "$baseDir\modules\settings\henu-os-design\henu-os-design.html" -Raw
Assert-Check "HTML links henu-os-advanced-editor.css" ($htmlContent.Contains("henu-os-advanced-editor.css"))
Assert-Check "HTML links henu-os-advanced-editor.js" ($htmlContent.Contains("henu-os-advanced-editor.js"))
Assert-Check "HTML has Advanced Designer trigger button" ($htmlContent.Contains("openAdvancedDesigner()"))

# 4. Check Backend API Endpoint for Template Save and Publish
try {
    $apiUrl = "http://localhost:5002/api/reports/member/templates/MEMBER_BILL_FORMAT"
    $response = Invoke-RestMethod -Uri $apiUrl -Method Get -TimeoutSec 5
    Assert-Check "Backend API /api/reports/member/templates/MEMBER_BILL_FORMAT responds with templates" ($response.success -eq $true)
} catch {
    Assert-Check "Backend API reachable" $false
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " VERIFICATION SUMMARY: $passed Passed, $failed Failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "==========================================================" -ForegroundColor Cyan
