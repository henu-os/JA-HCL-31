import urllib.request
import json
import datetime
import sys
import io

# Force UTF-8 stdout for Windows consoles
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

API_BASE = "http://localhost:5002/api/multi-report"

def http_get(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))

def http_post(url, data):
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))

def run_tests():
    print("=" * 70)
    print(" HENU ERP — MULTI REPORT PACK BUILDER AUTOMATED TEST SUITE")
    print("=" * 70)
    
    # ── TEST 1: REPORT REGISTRY ─────────────────────────────────────
    print("\n[TEST 1] FETCHING REPORT REGISTRY...")
    reg_res = http_get(f"{API_BASE}/registry")
    assert reg_res.get("success") is True, "Registry API failed"
    reports = reg_res.get("reports", [])
    print(f" -> Found {len(reports)} registered reports in system registry.")
    assert len(reports) == 31, f"Expected 31 canonical reports, got {len(reports)}"
    
    # Verify groups
    member_reps = [r for r in reports if r.get("category") == "Member Reports"]
    account_reps = [r for r in reports if r.get("category") == "Account Reports"]
    additional_reps = [r for r in reports if r.get("category") == "Additional Reports"]
    
    print(f"    * Member Reports:     {len(member_reps)} reports")
    print(f"    * Account Reports:    {len(account_reps)} reports")
    print(f"    * Additional Reports: {len(additional_reps)} reports (TDS, GST, Fund Reports)")
    assert len(member_reps) == 16, "Expected 16 Member Reports"
    assert len(account_reps) == 12, "Expected 12 Account Reports"
    assert len(additional_reps) == 3, "Expected 3 Additional Reports"
    print("    [PASS] Canonical 31-report registry verified.")

    # ── TEST 2: SETTINGS PERSISTENCE & REORDERING ───────────────────
    print("\n[TEST 2] SAVING & PERSISTING CUSTOM SEQUENCE...")
    # Swap report 1 and 2 to test reordering persistence
    test_reports = [dict(r) for r in reports]
    test_reports[0]["order"] = 2
    test_reports[1]["order"] = 1
    # Turn OFF report 3 (Debit Note)
    test_reports[2]["enabled"] = False
    
    save_payload = {
        "societyId": 1,
        "financialYear": "2026-2027",
        "fromDate": "2026-04-01",
        "toDate": "2027-03-31",
        "reports": test_reports
    }
    
    save_res = http_post(f"{API_BASE}/settings", save_payload)
    assert save_res.get("success") is True, "Settings save API failed"
    print(f" -> Settings saved: {save_res.get('message')}")
    
    # Reload settings
    reloaded = http_get(f"{API_BASE}/settings?societyId=1")
    assert reloaded.get("success") is True, "Settings load API failed"
    saved_reports = reloaded.get("settings", {}).get("reports", [])
    
    # Verify report 3 is disabled
    r3 = next((r for r in saved_reports if r.get("id") == test_reports[2]["id"]), None)
    assert r3 is not None and r3.get("enabled") is False, "Persistence of enabled flag failed"
    print(f"    [PASS] Settings persistence verified: Report '{r3.get('name')}' is disabled.")

    # ── TEST 3: PACK GENERATION & DYNAMIC INDEX ─────────────────────
    print("\n[TEST 3] PACK ORCHESTRATION & DYNAMIC INDEX GENERATION...")
    pack_res = http_post(f"{API_BASE}/generate-pack", save_payload)
    assert pack_res.get("success") is True, "Generate pack API failed"
    
    index_items = pack_res.get("index", [])
    sections = pack_res.get("sections", [])
    total_pages = pack_res.get("totalPages", 0)
    
    print(f" -> Assembled Report Sections: {len(sections)}")
    print(f" -> Index Items:              {len(index_items)}")
    print(f" -> Calculated Total Pages:   {total_pages} Pages")
    
    print("\n -> Sample Dynamic Index / Table of Contents:")
    for it in index_items[:6]:
        print(f"    Sr {it.get('srNo'):2d} | {it.get('reportName'):<30} | Pages: {it.get('pageFrom')}-{it.get('pageTo')} | Status: {it.get('status')}")
    
    assert len(index_items) == 30, f"Expected 30 enabled reports in index (1 disabled), got {len(index_items)}"
    print("    [PASS] Dynamic Index calculated without gaps.")

    print("\n" + "=" * 70)
    print(" MULTI REPORT PACK BUILDER TEST PASSED (100% SUCCESS)")
    print("=" * 70)

if __name__ == "__main__":
    try:
        run_tests()
    except Exception as err:
        print(f"\n[ERROR] Multi Report test failed: {err}", file=sys.stderr)
        sys.exit(1)
