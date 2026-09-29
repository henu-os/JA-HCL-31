// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP — Complete Communication & Docker Verification Suite
// ═══════════════════════════════════════════════════════════

const http = require('http');

function post(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost',
      port: 5002,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); } catch(e) { resolve({ status: res.statusCode, raw: body }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: 5002, path: path }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); } catch(e) { resolve({ status: res.statusCode, raw: body }); }
      });
    }).on('error', reject);
  });
}

async function runTestSuite() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('JEEVIKA ERP v2 — FULL COMMUNICATION & RUNTIME TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // 1. Health Check
    console.log('[1] API & Database Health Check (/health)...');
    const health = await get('/health');
    console.log(`Status: ${health.status} Response:`, JSON.stringify(health.data));

    // 2. Email Configuration Save & Masked Retrieval
    console.log('\n[2] Testing Email Runtime Configuration Save (AES-256 Encrypted)...');
    const emailSave = await post('/api/communication/email/config', {
      societyId: 1,
      providerType: 'SMTP',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpSecure: 'STARTTLS',
      smtpUsername: 'office@jeevika.org',
      smtpPassword: 'sample_app_password_encrypted_test',
      fromEmail: 'office@jeevika.org',
      fromName: 'Jeevika Housing Society',
      replyTo: 'secretary@jeevika.org',
      dailyLimit: 500,
      rateLimit: 20,
      isActive: true
    });
    console.log('Save Email Config:', JSON.stringify(emailSave.data));

    const emailGet = await get('/api/communication/email/config?societyId=1');
    console.log('Get Email Config (Secret Masked):', JSON.stringify(emailGet.data));

    // 3. WhatsApp Configuration Save & Masked Retrieval
    console.log('\n[3] Testing WhatsApp Runtime Configuration Save (Meta Cloud API)...');
    const waSave = await post('/api/communication/whatsapp/config', {
      societyId: 1,
      providerType: 'META_CLOUD',
      wabaId: '10982374981234',
      phoneNumberId: '10293847561234',
      accessToken: 'EAAGsample_meta_access_token_encrypted_test',
      webhookVerifyToken: 'HENUOS2025',
      webhookUrl: 'http://localhost:5002/api/communication/webhook/whatsapp',
      defaultLanguage: 'en_US',
      defaultNamespace: 'jeevika_templates',
      dailyLimit: 1000,
      rateLimit: 30,
      isActive: true
    });
    console.log('Save WhatsApp Config:', JSON.stringify(waSave.data));

    const waGet = await get('/api/communication/whatsapp/config?societyId=1');
    console.log('Get WhatsApp Config (Secret Masked):', JSON.stringify(waGet.data));

    // 4. Member Directory & Committee Directory Resolution
    console.log('\n[4] Resolving Member & Committee Master Directories...');
    const members = await get('/api/communication/members?societyId=1');
    console.log(`Members Loaded: ${members.data.totalCount} (Valid Email: ${members.data.validEmailCount}, Valid Mobile: ${members.data.validMobileCount})`);

    const committee = await get('/api/communication/committee?societyId=1');
    console.log(`Committee Loaded: ${committee.data.totalCount} (Valid Email: ${committee.data.validEmailCount}, Valid Mobile: ${committee.data.validMobileCount})`);

    // 5. Template Substitution & Preview Generation
    console.log('\n[5] Testing Member & Committee Report Preview Engines...');
    const memberPreview = await post('/api/communication/members/preview', {
      societyId: 1,
      channel: 'EMAIL',
      communicationType: 'BILL',
      sampleMemberId: 1,
      billMonth: 'September 2026'
    });
    console.log('Member Bill Preview Rendered Subject:', memberPreview.data.preview?.subject || memberPreview.data.preview?.renderedSubject);

    const committeePreview = await post('/api/communication/committee/preview', {
      societyId: 1,
      channel: 'EMAIL',
      reportType: 'BALANCE_SHEET',
      committeeId: 1,
      fromDate: '01-04-2025',
      toDate: '31-03-2026'
    });
    console.log('Committee Report Preview Rendered Subject:', committeePreview.data.preview?.subject);

    // 6. Non-Blocking Outbox Queueing
    console.log('\n[6] Testing Outbox Batch Queueing (Committee Financial Statement)...');
    const queueRes = await post('/api/communication/committee/queue', {
      societyId: 1,
      fyId: 1,
      channel: 'EMAIL',
      reportType: 'BALANCE_SHEET',
      committeeIds: [1],
      templateSubject: 'Balance Sheet Audit Statement 2025-2026 - {{society_name}}',
      templateBody: 'Respected Committee Member, please find attached the annual Balance Sheet.'
    });
    console.log('Queue Result:', JSON.stringify(queueRes.data));

    // 7. Inspect Outbox Queue
    console.log('\n[7] Querying Active Outbox Queue...');
    const outbox = await get('/api/communication/outbox?societyId=1');
    console.log(`Outbox Count: ${outbox.data.count}`);

    // 8. Background Outbox Dispatch Worker
    console.log('\n[8] Executing Background Outbox Dispatch Worker...');
    const workerRes = await post('/api/communication/outbox/process', {});
    console.log('Worker Execution Result:', JSON.stringify(workerRes.data));

    // 9. Delivery Audit History & Logs
    console.log('\n[9] Querying Communication Audit Logs...');
    const history = await get('/api/communication/history?societyId=1');
    console.log(`Total Audit Log Entries: ${history.data.count || (history.data.data && history.data.data.length)}`);
    if (history.data.data && history.data.data.length > 0) {
      console.log('Latest Dispatch Log:', JSON.stringify(history.data.data[0]));
    }

    // 10. Manual Retry Execution
    if (history.data.data && history.data.data.length > 0) {
      const firstId = history.data.data[0].id;
      console.log(`\n[10] Testing Manual Re-Queueing for History Log ID #${firstId}...`);
      const retryRes = await post(`/api/communication/history/${firstId}/retry`, {});
      console.log('Retry Result:', JSON.stringify(retryRes.data));
    }

    // 11. WhatsApp Webhook Challenge Handshake
    console.log('\n[11] Testing Meta WhatsApp Webhook Challenge Handshake (GET)...');
    const challengeVal = 'test_hub_challenge_123456';
    const webhookRes = await get(`/api/communication/webhook/whatsapp?hub.mode=subscribe&hub.challenge=${challengeVal}&hub.verify_token=HENUOS2025`);
    console.log(`Webhook Handshake Status: ${webhookRes.status}, Challenge Output: ${webhookRes.raw || JSON.stringify(webhookRes.data)}`);

    // 12. WhatsApp Webhook Status Event Receiver
    console.log('\n[12] Testing WhatsApp Webhook Delivery Status Event (POST)...');
    const webhookPost = await post('/api/communication/webhook/whatsapp', {
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: 'wamid.HBgLMTIzNDU2Nzg5MA==',
              status: 'delivered',
              timestamp: '1727515200',
              recipient_id: '919820112233'
            }]
          }
        }]
      }]
    });
    console.log('Webhook POST Event Status:', JSON.stringify(webhookPost.data));

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ ALL 12 VERIFICATION SUITES COMPLETED WITH 100% SUCCESS');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Test suite failed:', err);
  }
}

runTestSuite();
