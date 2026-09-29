const { Client } = require('pg');
const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'jeevika_db_v2'
});

async function main() {
  await client.connect();
  console.log('Connected to PostgreSQL database');

  const resMem = await client.query(`
    UPDATE jeevika_erp."SocMember"
    SET "Email" = 'henuosr@gmail.com', "ContactNo" = '+91 9352956727'
    WHERE "MemName" ILIKE '%Siddharth%' OR "MemName" ILIKE '%Rajesh%' OR "MemName" ILIKE '%pandaye%'
  `);
  console.log(`Updated ${resMem.rowCount} member record(s).`);

  const resComm = await client.query(`
    UPDATE jeevika_erp."SocCommittee"
    SET "Email" = 'henuosr@gmail.com', "ContactNo" = '+91 9352956727'
    WHERE "MemberName" ILIKE '%Siddharth%' OR "MemberName" ILIKE '%Rajendra%'
  `);
  console.log(`Updated ${resComm.rowCount} committee record(s).`);

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
