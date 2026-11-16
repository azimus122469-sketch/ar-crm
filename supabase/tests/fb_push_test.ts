import { createHandler } from '../functions/ar-mcp/core.ts';
import { generateKeyPairSync, createVerify } from 'node:crypto';
let fails = 0; const check = (n: string, c: any, x: any = '') => { if(!c){ fails++; console.log('FAIL', n, x); } else console.log('ok  ', n); };
const tables: Record<string, any[]> = { ar_devices: [], ar_invites: [], ar_tokens: [], ar_actions: [], ar_chat: [], ar_push: [], ar_archive: [], ar_archive_data: [], ar_vapid: [{ id: 1, public_key: null, private_key: null, cron_secret: 'cron-xyz' }] };
let clock = Date.parse('2026-11-15T09:00:00Z'), n = 0; // 14:00 в Ташкенте
const match = (r: any, f: any) => Object.entries(f || {}).every(([k, v]) => v === null ? (r[k] == null) : r[k] === v);
const store = {
  async select(t: string, f: any = {}, o: any = {}) { return tables[t].filter(r => match(r, f)).map(x => ({ ...x })); },
  async insert(t: string, row: any) { const r = { id: 'id' + (++n), created_at: new Date(clock).toISOString(), last_seen: new Date(clock).toISOString(), revoked_at: null, ...row }; tables[t].push(r); return { ...r }; },
  async update(t: string, f: any, p: any) { const xs = tables[t].filter(r => match(r, f)); xs.forEach(r => Object.assign(r, p)); return xs.map(x => ({ ...x })); },
  async delete(t: string, f: any) { tables[t] = tables[t].filter(r => !match(r, f)); }
};
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const sa = JSON.stringify({ client_email: 'fb@ar-crm-c46c3.iam.gserviceaccount.com', private_key: pem, project_id: 'ar-crm-c46c3' });
const envs: any = { ADMIN_SETUP_CODE: 'setup-123' };
const FS: any = { objects: [], cashbox: [], stock: [] };
const fetchLog: any[] = [];
const fakeFetch: any = async (url: string, init: any) => {
  fetchLog.push({ url, init });
  if (url.includes('oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 'gtok', expires_in: 3600 }));
  return new Response('{}');
};
let sendStatus = 201; const sent: any[] = [];
const push = { async genKeys() { return { publicKey: 'PUB', privateKey: 'PRIV' }; }, async send(sub: any, payload: string, v: any) { sent.push({ sub, payload: JSON.parse(payload), v }); return sendStatus; } };
const h = createHandler({ store: store as any, loadCollection: async c => FS[c], env: k => envs[k], fetch: fakeFetch, now: () => clock, push });
const call = async (method: string, path: string, body?: any, headers: any = {}) => { const r = await h(new Request('https://x.supabase.co/functions/v1/ar-mcp' + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined })); return { status: r.status, j: await r.json().catch(() => null) }; };

(async () => {
  let r = await call('POST', '/register', { setup_code: 'setup-123', name: 'А' }); const A = { 'x-ar-device': r.j.token }, aId = r.j.device_id;
  r = await call('POST', '/invite', { who: 'redvan' }, A); r = await call('POST', '/join', { code: r.j.code, name: 'Р' }); const R = { 'x-ar-device': r.j.token }, rId = r.j.device_id;

  // — пропуск Firebase —
  r = await call('POST', '/firebase-token', {}, A); check('без ключа Firebase: 503 firebase_not_configured', r.status === 503 && /firebase_not_configured/.test(r.j.error), JSON.stringify(r));
  r = await call('POST', '/firebase-token', {}); check('без устройства пропуск не выдаётся', r.status === 401);
  envs.FIREBASE_SERVICE_ACCOUNT = sa;
  r = await call('POST', '/firebase-token', {}, A); check('пропуск выдан', r.j.ok && r.j.token.split('.').length === 3, JSON.stringify(r.j));
  const [hd, pl, sg] = r.j.token.split('.'), P = JSON.parse(Buffer.from(pl, 'base64url').toString());
  const v = createVerify('RSA-SHA256'); v.update(hd + '.' + pl);
  check('подпись пропуска проверяется публичным ключом', v.verify(publicKey, Buffer.from(sg, 'base64url')));
  check('в пропуске uid устройства и отметка ar', P.uid === 'dev-' + aId && P.claims.ar === true && P.claims.who === 'aziz' && P.exp - P.iat === 3600 && /IdentityToolkit$/.test(P.aud) && P.iss === 'fb@ar-crm-c46c3.iam.gserviceaccount.com', JSON.stringify(P));
  check('приватный ключ не вернулся клиенту', !JSON.stringify(r.j).includes('PRIVATE KEY'));
  // — отзыв отключает пользователя Firebase —
  fetchLog.length = 0;
  r = await call('POST', '/devices/revoke', { id: rId }, A); check('отзыв устройства', r.j.ok);
  const upd = fetchLog.find(x => x.url.includes('accounts:update'));
  check('пользователь Firebase отключён', upd && JSON.parse(upd.init.body).localId === 'dev-' + rId && JSON.parse(upd.init.body).disableUser === true && upd.init.headers.Authorization === 'Bearer gtok', JSON.stringify(upd));
  r = await call('POST', '/firebase-token', {}, R); check('отозванное устройство пропуск не получит', r.status === 401);

  // — напоминания —
  r = await call('POST', '/invite', { who: 'redvan' }, A); r = await call('POST', '/join', { code: r.j.code, name: 'Р2' }); const R2 = { 'x-ar-device': r.j.token };
  r = await call('GET', '/push/key', undefined, A); check('ключ VAPID создан и отдан', r.j.ok && r.j.key === 'PUB' && tables.ar_vapid[0].private_key === 'PRIV');
  r = await call('GET', '/push/key'); check('ключ без устройства не отдаётся', r.status === 401);
  r = await call('POST', '/push/subscribe', { subscription: { endpoint: 'http://bad', keys: {} } }, A); check('кривая подписка отклонена', r.status === 400);
  const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'k1', auth: 'k2' } };
  r = await call('POST', '/push/subscribe', { subscription: sub, hour: 19, tz: 300 }, A); check('подписка сохранена', r.j.ok && tables.ar_push.length === 1 && tables.ar_push[0].hour === 19);
  r = await call('POST', '/push/subscribe', { subscription: sub, hour: 18, tz: 300 }, A); check('повторная подписка обновляет, не дублирует', tables.ar_push.length === 1 && tables.ar_push[0].hour === 18);
  r = await call('POST', '/push/test', {}, A); check('тест-уведомление отправлено', r.j.ok && sent.at(-1).payload.tag === 'ar-test' && sent.at(-1).sub.endpoint === sub.endpoint);
  r = await call('POST', '/push/tick', {}); check('расписание без секрета закрыто', r.status === 401);
  r = await call('POST', '/push/tick', {}, { 'x-ar-cron': 'wrong' }); check('расписание с неверным секретом закрыто', r.status === 401);
  const tick = () => call('POST', '/push/tick', {}, { 'x-ar-cron': 'cron-xyz' });
  sent.length = 0;
  r = await tick(); check('до 18:00 не шлёт (сейчас 14:00)', r.j.ok && r.j.due === 0 && !sent.length, JSON.stringify(r.j));
  check('расписание сняло копию архива', r.j.archive && r.j.archive.status === 'saved' && tables.ar_archive.length === 1, JSON.stringify(r.j.archive));
  r = await tick(); check('архив в тот же день не дублируется', r.j.archive.status === 'fresh' && tables.ar_archive.length === 1, JSON.stringify(r.j.archive));
  clock = Date.parse('2026-11-15T13:20:00Z'); // 18:20 Ташкент
  FS.cashbox = [{ id: 'c', type: 'overhead', amount: 1, ts: Date.parse('2026-11-15T07:00:00Z') }]; // запись сегодня (12:00)
  r = await tick(); check('есть запись за сегодня: не шлёт, день отмечен', r.j.skipped === 1 && !sent.length && tables.ar_push[0].last_sent === '2026-11-15', JSON.stringify(r.j));
  clock = Date.parse('2026-11-16T13:20:00Z'); FS.cashbox = [{ id: 'c', ts: Date.parse('2026-11-15T07:00:00Z') }]; // вчерашняя запись
  r = await tick(); check('нет записей сегодня: напоминание ушло', r.j.sent === 1 && sent.length === 1 && sent[0].payload.tag === 'ar-remind' && /не внесено/.test(sent[0].payload.body) && sent[0].v.publicKey === 'PUB', JSON.stringify(r.j));
  r = await tick(); check('в тот же день повторно не шлёт', r.j.due === 0 && sent.length === 1);
  clock = Date.parse('2026-11-17T13:20:00Z'); sendStatus = 410;
  r = await tick(); check('умершая подписка удаляется', r.j.gone === 1 && tables.ar_push.length === 0, JSON.stringify(r.j));
  // выкл
  sendStatus = 201; await call('POST', '/push/subscribe', { subscription: sub, hour: 19, tz: 300 }, A); r = await call('POST', '/push/off', { endpoint: sub.endpoint }, A);
  check('отключение удаляет подписку', r.j.ok && tables.ar_push.length === 0);
  // отзыв удаляет подписки устройства
  await call('POST', '/push/subscribe', { subscription: { ...sub, endpoint: 'https://push.example/zzz' }, hour: 19 }, R2); r = await call('GET', '/devices', undefined, A);
  const r2id = r.j.devices.find((x: any) => x.name === 'Р2').id; await call('POST', '/devices/revoke', { id: r2id }, A);
  check('при отзыве подписки устройства удаляются', tables.ar_push.length === 0);
  console.log(fails ? 'FB/PUSH FAILED ' + fails : 'ALL FB/PUSH TESTS PASSED'); process.exit(fails ? 1 : 0);
})();
