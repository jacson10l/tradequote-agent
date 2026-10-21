import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
export function openStore(file) {
  const db = new Database(file);
  db.pragma('foreign_keys = ON'); db.pragma('journal_mode = WAL');
  const orm = drizzle(db);
  if (db.pragma('user_version', { simple: true }) === 0) db.transaction(() => {
    orm.run(sql`CREATE TABLE quote(id TEXT PRIMARY KEY, version INTEGER NOT NULL)`);
    orm.run(sql`CREATE TABLE revision(id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quote(id), seq INTEGER NOT NULL, total TEXT NOT NULL, snapshot TEXT NOT NULL, UNIQUE(quote_id,seq))`);
    orm.run(sql`CREATE TABLE idempotency(key TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, result TEXT NOT NULL)`);
    orm.run(sql`CREATE TABLE outbox(seq INTEGER PRIMARY KEY, revision_id TEXT NOT NULL REFERENCES revision(id))`);
    db.prepare('INSERT INTO quote VALUES (?,0)').run('synthetic-quote');
    db.pragma('user_version = 1');
  })();
  const revise = db.transaction((args, key, failAfterInsert = false) => {
    const payloadHash = hash(JSON.stringify(args));
    const prior = db.prepare('SELECT * FROM idempotency WHERE key=?').get(key);
    if (prior) { if (prior.payload_hash !== payloadHash) throw new Error('IDEMPOTENCY_CONFLICT'); return JSON.parse(prior.result); }
    const q = db.prepare('SELECT * FROM quote WHERE id=?').get('synthetic-quote');
    if (q.version !== args.expectedVersion) throw new Error('REVISION_CONFLICT');
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(args.quantity) || !new Decimal(args.quantity).isPositive()) throw new Error('VALIDATION_ERROR');
    const seq = q.version + 1;
    const result = { revisionId: `synthetic-revision-${seq}`, version: seq, total: new Decimal(args.quantity).times('0.10').toFixed(2), state: 'draft' };
    db.prepare('INSERT INTO revision VALUES (?,?,?,?,?)').run(result.revisionId, q.id, seq, result.total, JSON.stringify({ ...args, ...result }));
    if (failAfterInsert) throw new Error('INJECTED_STORAGE_FAILURE');
    db.prepare('INSERT INTO outbox(revision_id) VALUES (?)').run(result.revisionId);
    db.prepare('UPDATE quote SET version=? WHERE id=?').run(seq,q.id);
    db.prepare('INSERT INTO idempotency VALUES (?,?,?)').run(key,payloadHash,JSON.stringify(result));
    return result;
  });
  return { db, revise };
}
export async function storageProbe(dir, phase) {
  const { db, revise } = openStore(`${dir}/业务.sqlite`);
  const checks = [];
  const ok = name => checks.push(name);
  try {
    if (phase === 'initial') {
      assert.equal(revise({ quantity: '3', expectedVersion: 0 }, 'operation-1').total,'0.30'); ok('native-sqlite-drizzle-decimal-text');
      assert.equal(db.pragma('foreign_keys',{simple:true}),1);
      assert.throws(()=> db.prepare('INSERT INTO outbox(revision_id) VALUES (?)').run('missing')); ok('foreign-keys-enforced');
      assert.throws(()=> revise({ quantity:'4',expectedVersion:1 },'operation-fail',true),/INJECTED/);
      assert.equal(db.prepare('SELECT count(*) n FROM revision').get().n,1);
      assert.equal(db.prepare('SELECT count(*) n FROM outbox').get().n,1);
      assert.equal(db.prepare('SELECT count(*) n FROM idempotency').get().n,1); ok('atomic-rollback-revision-outbox-idempotency');
      await db.backup(`${dir}/backup.sqlite`); ok('wal-consistent-backup');
      assert.throws(()=> db.transaction(()=>{ db.exec('ALTER TABLE quote ADD COLUMN broken TEXT'); db.exec('THIS IS INVALID SQL'); db.pragma('user_version=99'); })());
      assert.equal(db.pragma('user_version',{simple:true}),1);
      assert.equal(db.pragma('table_info(quote)').some(x=>x.name==='broken'),false); ok('migration-failure-rolls-back');
    } else {
      assert.equal(revise({ quantity:'3',expectedVersion:0 },'operation-1').revisionId,'synthetic-revision-1'); ok('process-restart-idempotency');
      assert.throws(()=>revise({ quantity:'4',expectedVersion:0 },'operation-1'),/IDEMPOTENCY_CONFLICT/); ok('same-key-different-payload-conflict');
      assert.throws(()=>revise({ quantity:'4',expectedVersion:0 },'operation-stale'),/REVISION_CONFLICT/); ok('stale-version-rejected');
      assert.equal(db.prepare('SELECT count(*) n FROM revision').get().n,1); ok('crash-uncommitted-transaction-rolled-back');
      db.transaction(()=>{ db.exec('ALTER TABLE quote ADD COLUMN note TEXT'); db.pragma('user_version=2'); })();
      assert.equal(db.pragma('user_version',{simple:true}),2); ok('upgrade-v1-to-v2');
      const restored = new Database(`${dir}/backup.sqlite`);
      assert.equal(restored.pragma('user_version',{simple:true}),1);
      assert.equal(restored.prepare('SELECT total FROM revision').get().total,'0.30'); restored.close(); ok('backup-restores-original-schema-and-data');
    }
    return checks;
  } finally { db.close(); }
}
