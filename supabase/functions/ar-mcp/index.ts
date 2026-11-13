// АР · Тетрадь: вход функции. Логика в core.ts.
// Секреты проекта: ADMIN_SETUP_CODE (код первого запуска главного устройства), OPENAI_API_KEY, OPENAI_MODEL (необязательно).
// Данные CRM читаются из Firestore по REST тем же публичным ключом, что и приложение
// (FIREBASE_API_KEY и FIREBASE_PROJECT можно переопределить секретами).
import { createHandler, fsDoc, type Deps, type Row, type Store } from "./core.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" };

function filterQs(filter: Row = {}) {
  return Object.entries(filter).map(([k, v]) => `${encodeURIComponent(k)}=${v === null ? "is.null" : "eq." + encodeURIComponent(String(v))}`);
}
async function pg(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error("база: " + (txt.slice(0, 200) || r.status));
  return txt ? JSON.parse(txt) : [];
}
const store: Store = {
  select: (table, filter, opts) => {
    const q = filterQs(filter);
    if (opts?.order) q.push(`order=${opts.order}.${opts.desc ? "desc" : "asc"}`);
    if (opts?.limit) q.push(`limit=${opts.limit}`);
    return pg(`${table}?select=*${q.length ? "&" + q.join("&") : ""}`);
  },
  insert: async (table, row) => (await pg(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) }))[0],
  update: (table, filter, patch) => pg(`${table}?${filterQs(filter).join("&")}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }),
};

const FB_KEY = Deno.env.get("FIREBASE_API_KEY") || "AIzaSyDrnbfSNxy1FaUgzAeExe-pR0TbxkPt9vc";
const FB_PROJECT = Deno.env.get("FIREBASE_PROJECT") || "ar-crm-c46c3";
async function loadCollection(name: string): Promise<Row[]> {
  const out: Row[] = [];
  let token = "";
  for (let i = 0; i < 40; i++) {
    const url = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents/${name}?pageSize=300&key=${FB_KEY}${token ? "&pageToken=" + encodeURIComponent(token) : ""}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Firestore (${name}): ${r.status}. Проверь правила базы и ключ.`);
    const j = await r.json();
    (j.documents || []).forEach((d: any) => out.push(fsDoc(d)));
    if (!j.nextPageToken) break;
    token = j.nextPageToken;
  }
  return out;
}

const deps: Deps = { store, loadCollection, env: (k) => Deno.env.get(k), fetch, now: () => Date.now() };
Deno.serve(createHandler(deps));
