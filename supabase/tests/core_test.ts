import { createHandler, TOOLS, fsDoc } from '../functions/ar-mcp/core.ts';
let fails = 0; const check = (n: string, c: any, x: any = '') => { if(!c){ fails++; console.log('FAIL', n, x); } else console.log('ok  ', n); };

// ── фейковая база ──
const tables: Record<string, any[]> = { ar_devices: [], ar_invites: [], ar_tokens: [], ar_actions: [], ar_chat: [] };
let clock = Date.parse('2026-11-12T09:00:00Z'); let n = 0;
const match = (r: any, f: any) => Object.entries(f || {}).every(([k, v]) => v === null ? (r[k] == null) : r[k] === v);
const store = {
  async select(t: string, f: any = {}, o: any = {}) { let xs = tables[t].filter(r => match(r, f)); if (o.order) xs = xs.slice().sort((a, b) => (a[o.order] < b[o.order] ? -1 : a[o.order] > b[o.order] ? 1 : 0) * (o.desc ? -1 : 1)); if (o.limit) xs = xs.slice(0, o.limit); return xs.map(x => ({ ...x })); },
  async insert(t: string, row: any) { const r = { id: 'id' + (++n), created_at: new Date(clock++).toISOString(), last_seen: new Date(clock).toISOString(), revoked_at: null, used_at: null, status: 'pending', ...row }; tables[t].push(r); return { ...r }; },
  async update(t: string, f: any, p: any) { const xs = tables[t].filter(r => match(r, f)); xs.forEach(r => Object.assign(r, p)); return xs.map(x => ({ ...x })); }
};
// ── фейковые данные Firestore (в декодированном виде) ──
const T = Date.parse('2026-11-10T08:00:00Z');
const FS: any = {
  objects: [
    { id: 'o1', name: 'Квартира', type: 'project', status: 'working', partner: 'aziz', transactions: [
      { id: 1, ts: T, type: 'income', amount: 1000000, desc: 'Аванс', createdBy: 'aziz' }, { id: 2, ts: T, type: 'expense', amount: 200000, desc: 'Профиль', createdBy: 'aziz' } ] },
    { id: 'o2', name: 'Тест', sandbox: true, transactions: [{ id: 9, ts: T, type: 'income', amount: 999999999 }] }
  ],
  cashbox: [
    { id: 'c1', type: 'contribution', desc: 'Вложил', amount: 500000, partner: 'aziz', ts: T },
    { id: 'c2', type: 'overhead', desc: 'Бензин', amount: 100000, partner: 'redvan', ts: T },
    { id: 'c3', type: 'draw', desc: 'Забрал себе', amount: 700000, partner: 'aziz', ts: T }
  ],
  stock: [
    { id: 's1', kind: 'in', sid: 'sA', ts: T, material: 'Багет', unit: 'м', qty: 500, price: 3240, usd: 0.27, rate: 12000, sum: 1620000, partner: 'redvan', src: 'cash', createdBy: 'redvan' },
    { id: 's2', kind: 'in', sid: 'sB', ts: T + 1000, material: 'багет', unit: 'м', qty: 100, price: 3360, sum: 336000, partner: 'redvan', src: 'cash', createdBy: 'redvan' },
    { id: 's3', kind: 'out', sid: 'sC', ts: T + 2000, material: 'Багет', unit: 'м', qty: 120, price: 3260, sum: 391200, objectId: 'o1', objectName: 'Квартира', createdBy: 'aziz' },
    { id: 's4', kind: 'min', ts: T + 3000, material: 'Багет', min: 500 }
  ]
};
let openaiScript: any[] = []; let openaiCalls: any[] = [];
const fakeFetch: any = async (url: string, init: any) => {
  openaiCalls.push(JSON.parse(init.body));
  const out = openaiScript.shift();
  return new Response(JSON.stringify(out), { status: out ? 200 : 500 });
};
const envs: any = { ADMIN_SETUP_CODE: 'setup-123', OPENAI_API_KEY: 'sk-test' };
const h = createHandler({ store: store as any, loadCollection: async (c) => FS[c], env: k => envs[k], fetch: fakeFetch, now: () => clock });
const call = async (method: string, path: string, body?: any, headers: any = {}) => { const r = await h(new Request('https://x.supabase.co/functions/v1/ar-mcp' + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined })); return { status: r.status, j: await r.json().catch(() => null) }; };

// ── Firestore-декодер ──
const d = fsDoc({ name: 'projects/p/databases/(default)/documents/objects/abc', fields: { name: { stringValue: 'X' }, n: { integerValue: '5' }, t: { arrayValue: { values: [{ mapValue: { fields: { amount: { integerValue: '100' }, ts: { integerValue: '7' } } } }] } }, createdAt: { timestampValue: '2026-11-10T00:00:00Z' } } });
check('декодер Firestore', d.id === 'abc' && d.n === 5 && d.t[0].amount === 100 && d.createdAt === Date.parse('2026-11-10T00:00:00Z'), JSON.stringify(d));

(async () => {
  // регистрация
  let r = await call('POST', '/register', { setup_code: 'wrong', name: 'Телефон Азиза' });
  check('неверный код настройки отклонён', r.status === 401, JSON.stringify(r));
  r = await call('POST', '/register', { setup_code: 'setup-123', name: 'Телефон Азиза', platform: 'Android' });
  check('главное устройство зарегистрировано', r.j.ok && r.j.is_main && r.j.who === 'aziz' && /^ard_/.test(r.j.token), JSON.stringify(r.j));
  const A = { 'x-ar-device': r.j.token };
  check('токен в базе только хэшем', !JSON.stringify(tables.ar_devices).includes(r.j.token));
  r = await call('POST', '/register', { setup_code: 'setup-123', name: 'Второй' });
  check('второе главное устройство нельзя', r.status === 409, JSON.stringify(r));
  // без токена
  r = await call('GET', '/devices'); check('без токена устройства нельзя', r.status === 401);
  // приглашение для Редвана (iPhone)
  r = await call('POST', '/invite', { who: 'redvan' }, A); check('приглашение создано', r.j.ok && /^[A-Z2-9]{8}$/.test(r.j.code), JSON.stringify(r.j));
  const code = r.j.code;
  r = await call('POST', '/join', { code: 'AAAAAAAA', name: 'iPhone Редвана' }); check('неверный код приглашения', r.status === 401);
  r = await call('POST', '/join', { code: code.toLowerCase(), name: 'iPhone Редвана', platform: 'iPhone' });
  check('телефон Редвана подключён', r.j.ok && r.j.who === 'redvan' && !r.j.is_main, JSON.stringify(r.j));
  const R = { 'x-ar-device': r.j.token }; const redvanId = r.j.device_id;
  r = await call('POST', '/join', { code, name: 'ещё' }); check('код приглашения одноразовый', r.status === 401);
  r = await call('POST', '/invite', { who: 'redvan' }, R); check('партнёр тоже может приглашать (равные права)', r.status === 200 && r.j.code);
  // список устройств
  r = await call('GET', '/devices', undefined, A);
  check('главный видит 2 устройства', r.j.devices.length === 2 && r.j.is_main && r.j.devices.filter((x: any) => x.me).length === 1, JSON.stringify(r.j));
  r = await call('GET', '/devices', undefined, R); check('партнёр видит тот же список', r.j.devices.length === 2 && r.j.is_main);
  r = await call('POST', '/devices/revoke', { id: redvanId }, R); check('партнёр не может отозвать своё же устройство', r.status === 400);
  // токены MCP
  r = await call('POST', '/tokens/create', { name: 'Claude' }, R); check('партнёр создаёт токены (равные права)', r.status === 200 && /^arm_/.test(r.j.token));
  r = await call('POST', '/tokens/create', { name: 'Claude' }, A); check('токен MCP создан', r.j.ok && /^arm_/.test(r.j.token), JSON.stringify(r.j));
  const MT = r.j.token;
  check('MCP-токен в базе только хэшем', !JSON.stringify(tables.ar_tokens).includes(MT));
  // MCP: Claude (JSON-RPC)
  r = await call('POST', '/', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, { authorization: 'Bearer ' + MT });
  check('MCP initialize', r.j.result.serverInfo.name === 'ar-tetrad', JSON.stringify(r.j));
  r = await call('POST', '/', { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { authorization: 'Bearer ' + MT });
  check('MCP tools/list', r.j.result.tools.length === TOOLS.length && r.j.result.tools.some((t: any) => t.name === 'propose_add_cash'));
  r = await call('POST', '/', { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_overview', arguments: {} } }, { authorization: 'Bearer ' + MT });
  const ov = JSON.parse(r.j.result.content[0].text);
  // клиенты 1 000 000, расход объекта 200 000, общий 100 000, вложил 500 000, взял 700 000 → остаток 500 000, прибыль 700 000
  check('MCP overview: остаток и прибыль как в приложении', ov.cash_left === 500000 && ov.profit === 700000, JSON.stringify(ov));
  check('MCP overview: песочница не считается', ov.clients_income === 1000000);
  check('MCP overview: расчёт Азиза (доля 350 000 + вложил 500 000 − взял 700 000 = 150 000)', ov.partners.aziz.owed === 150000 && ov.partners.aziz.contribution_returned === 500000 && ov.partners.aziz.contribution_left_to_return === 0 && ov.partners.aziz.taken_from_profit_share === 200000, JSON.stringify(ov.partners.aziz));
  check('MCP overview: расчёт Редвана (доля 350 000)', ov.partners.redvan.owed === 350000);
  // n8n: простой HTTP тем же токеном (разные способы передачи)
  r = await call('GET', '/tools', undefined, { 'x-ar-token': MT }); check('HTTP /tools (заголовок x-ar-token)', r.j.tools.length === TOOLS.length);
  r = await call('POST', '/call?token=' + MT, { tool: 'month_report', arguments: { ym: '2026-11' } });
  check('HTTP /call (токен в адресе): отчёт за месяц', r.j.ok && r.j.result.month_totals.profit === 700000 && r.j.result.end_of_month_cumulative.cash_left === 500000, JSON.stringify(r.j).slice(0, 300));
  r = await call('POST', '/call', { tool: 'get_overview' }, { 'x-ar-token': 'arm_bad' }); check('чужой токен отклонён', r.status === 401);
  r = await call('POST', '/call', { tool: 'get_overview' }, A); check('токен устройства не открывает MCP', r.status === 401);
  // предложения
  r = await call('POST', '/call', { tool: 'propose_add_cash', arguments: { kind: 'overhead', partner: 'aziz', usd: 50, rate: 12000, desc: 'клей', from_own_pocket: true } }, { 'x-ar-token': MT });
  check('предложение «из своих» в долларах', r.j.ok && r.j.result.status === 'pending' && /600 000/.test(r.j.result.summary), JSON.stringify(r.j));
  const pid = r.j.result.proposal_id; const act = tables.ar_actions.find(a => a.id === pid);
  check('в предложении пара: вложение + расход с общим pairId', act.ops.length === 2 && act.ops[0].rec.type === 'contribution' && act.ops[1].rec.type === 'overhead' && act.ops[0].rec.pairId === act.ops[1].rec.pairId && act.ops[0].rec.createdBy === 'assistant' && act.ops[0].rec.amount === 600000 && act.ops[0].rec.usd === 50);
  check('ничего в данных не изменено', FS.cashbox.length === 3);
  r = await call('POST', '/call', { tool: 'propose_add_cash', arguments: { kind: 'overhead', partner: 'aziz', usd: 50, desc: 'клей' } }, { 'x-ar-token': MT }); check('доллары без курса отклонены', !r.j.ok && /rate/.test(r.j.error), JSON.stringify(r.j));
  r = await call('POST', '/call', { tool: 'propose_add_object_tx', arguments: { object_id: 'o2', type: 'income', amount: 1000, desc: 'x' } }, { 'x-ar-token': MT }); check('песочница недоступна', !r.j.ok);
  r = await call('POST', '/call', { tool: 'propose_update_record', arguments: { key: 'c:c2', amount: 120000 } }, { 'x-ar-token': MT });
  check('предложение исправить запись', r.j.ok && tables.ar_actions.at(-1).ops[0].patch.editedBy === 'assistant' && tables.ar_actions.at(-1).ops[0].patch.amount === 120000, JSON.stringify(r.j));
  // склад
  r = await call('POST', '/call', { tool: 'get_stock', arguments: {} }, { 'x-ar-token': MT });
  const st = r.j.result.materials[0];
  check('склад: «Багет» и «багет» — один материал, остаток 480 м', r.j.result.materials.length === 1 && st.left === 480 && st.in_qty === 600 && st.out_qty === 120, JSON.stringify(r.j.result));
  check('склад: средняя цена по покупкам (1 956 000 / 600 = 3 260), стоимость остатка', st.avg_price === 3260 && st.value === 1564800, JSON.stringify(st));
  check('склад: минимум 500, значит мало', st.min === 500 && st.low === true);
  r = await call('POST', '/call', { tool: 'propose_stock_in', arguments: { material: 'Вставка чёрная', unit: 'м', qty: 100, price_usd: 0.65, rate: 12000, partner: 'redvan', pay: 'own' } }, { 'x-ar-token': MT });
  const sa = tables.ar_actions.at(-1);
  check('приход из своих: склад + вложение + расход в паре', r.j.ok && sa.ops.length === 3 && sa.ops[0].op === 'addStock' && sa.ops[0].rec.sum === 780000 && sa.ops[1].rec.type === 'contribution' && sa.ops[2].rec.type === 'overhead' && sa.ops[1].rec.pairId === sa.ops[2].rec.pairId && sa.ops[1].rec.stockId === sa.ops[0].rec.sid && sa.ops[1].rec.usd === 65, JSON.stringify(sa.ops));
  r = await call('POST', '/call', { tool: 'propose_stock_in', arguments: { material: 'Кольцо', qty: 10, price: 5000, partner: 'aziz', pay: 'none' } }, { 'x-ar-token': MT });
  check('приход без кассы: только склад', r.j.ok && tables.ar_actions.at(-1).ops.length === 1);
  r = await call('POST', '/call', { tool: 'propose_stock_in', arguments: { material: 'Кольцо', qty: 10, partner: 'aziz' } }, { 'x-ar-token': MT }); check('приход без цены отклонён', !r.j.ok && /price/.test(r.j.error), JSON.stringify(r.j));
  r = await call('POST', '/call', { tool: 'propose_stock_out', arguments: { material: 'багет', qty: 500 } }, { 'x-ar-token': MT }); check('списание больше остатка отклонено', !r.j.ok && /480/.test(r.j.error), JSON.stringify(r.j));
  r = await call('POST', '/call', { tool: 'propose_stock_out', arguments: { material: 'Багет', qty: 80, object_id: 'o1', partner: 'redvan' } }, { 'x-ar-token': MT });
  check('списание по средней цене на объект, кассу не трогает', r.j.ok && tables.ar_actions.at(-1).ops.length === 1 && tables.ar_actions.at(-1).ops[0].rec.sum === 260800 && tables.ar_actions.at(-1).ops[0].rec.objectName === 'Квартира', JSON.stringify(tables.ar_actions.at(-1).ops));
  r = await call('POST', '/call', { tool: 'propose_delete', arguments: { keys: ['o:o1:2'] } }, { 'x-ar-token': MT });
  check('предложение удалить расход объекта', r.j.ok && tables.ar_actions.at(-1).ops[0].op === 'removeTx' && tables.ar_actions.at(-1).ops[0].oid === 'o1', JSON.stringify(r.j));
  // приложение: чат и одобрение
  r = await call('GET', '/chat', undefined, R); check('чат виден партнёру, предложения в списке', r.j.ok && r.j.actions.length === 6 && r.j.messages.length === 6, JSON.stringify(r.j).slice(0, 200));
  r = await call('POST', '/actions/claim', { id: pid }, R); check('одобрение: операции переданы', r.j.ok && r.j.ops.length === 2);
  r = await call('POST', '/actions/claim', { id: pid }, A); check('повторное одобрение невозможно', r.status === 409);
  r = await call('POST', '/actions/reject', { id: tables.ar_actions[1]?.id || 'x' }, A);
  r = await call('POST', '/actions/result', { id: pid, ok: false, error: 'нет связи' }, R); check('ошибка исполнения фиксируется', tables.ar_actions.find(a => a.id === pid).status === 'failed');
  // внутренний ИИ
  openaiScript = [
    { status: 'completed', output: [{ type: 'function_call', name: 'get_overview', arguments: '{}', call_id: 'k1' }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'В кассе 500 000 сум.' }] }] }
  ];
  r = await call('POST', '/chat/send', { content: 'сколько в кассе?' }, R);
  check('ИИ ответил по данным', r.j.ok && tables.ar_chat.at(-1).role === 'assistant' && tables.ar_chat.at(-1).content === 'В кассе 500 000 сум.', JSON.stringify(r.j));
  check('ИИ получил результат инструмента', JSON.stringify(openaiCalls[1].input).includes('function_call_output') && JSON.stringify(openaiCalls[1].input).includes('500000'));
  check('в запрос к ИИ не попал ключ в тексте', !JSON.stringify(openaiCalls).includes('sk-test'));
  check('сообщение помечено кто написал', tables.ar_chat.find(m => m.role === 'user').who === 'redvan');
  check('у ИИ нет send_chat_message и describe_crm как инструментов', !openaiCalls[0].tools.some((t: any) => t.name === 'send_chat_message' || t.name === 'describe_crm'));
  // ключа нет
  delete envs.OPENAI_API_KEY; r = await call('POST', '/chat/send', { content: 'привет' }, A);
  check('без ключа ИИ понятно сообщает', /нет ключа OpenAI/.test(tables.ar_chat.at(-1).content), tables.ar_chat.at(-1).content); envs.OPENAI_API_KEY = 'sk-test';
  // отзыв устройства
  r = await call('POST', '/devices/revoke', { id: redvanId }, A); check('отзыв устройства', r.j.ok);
  r = await call('GET', '/chat', undefined, R); check('отозванное устройство больше не имеет доступа', r.status === 401);
  r = await call('POST', '/devices/revoke', { id: tables.ar_devices[0].id }, A); check('своё устройство отозвать нельзя', r.status === 400);
  // отзыв MCP-токена
  r = await call('POST', '/tokens/revoke', { id: tables.ar_tokens[1].id }, A); check('отзыв MCP-токена', r.j.ok);
  r = await call('POST', '/call', { tool: 'get_overview' }, { 'x-ar-token': MT }); check('отозванный MCP-токен не работает', r.status === 401);
  console.log(fails ? 'CORE FAILED ' + fails : 'ALL CORE TESTS PASSED'); process.exit(fails ? 1 : 0);
})();
