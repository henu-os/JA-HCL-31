import urllib.request
import json

endpoints = [
    ('Bill Format', 'http://localhost:5002/api/reports/bill-format/gst-a4?societyId=2&fyId=1'),
    ('Receipt', 'http://localhost:5002/api/reports/receipt-print?societyId=2&fyId=1'),
    ('Debit Note', 'http://localhost:5002/api/reports/debit-note-print?societyId=2&fyId=1'),
    ('Credit Note', 'http://localhost:5002/api/reports/credit-note-print?societyId=2&fyId=1'),
    ('Adjustment', 'http://localhost:5002/api/reports/adjustment-print?societyId=2&fyId=1'),
]

print("=== VERIFYING ALL 5 FORMAT MODULES & BACKEND ENDPOINTS ===")
for name, url in endpoints:
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            data = json.loads(r.read().decode('utf-8'))
            print(f"[OK] {name:<18} -> HTTP {r.status} | Success: {data.get('success', False)}")
    except Exception as e:
        print(f"[FAIL] {name:<18} -> Error: {e}")
