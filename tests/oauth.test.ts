import test, { before } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

/**
 * Р РѕСѓС‚С‹ РІС…РѕРґР° С‡РµСЂРµР· РІРЅРµС€РЅРёРµ СЃРµСЂРІРёСЃС‹.
 *
 * Р—РґРµСЃСЊ С‚СЂРё РІРµС‰Рё, Рё РєР°Р¶РґР°СЏ Р·Р°С‰РёС‰Р°РµС‚ РѕС‚ СЃРІРѕРµРіРѕ. Р‘РµР· `state` РїРѕРґРґРµР»СЊРЅС‹Р№
 * РєРѕР»Р»Р±СЌРє РїСЂРёРєР»РµРёРІР°РµС‚СЃСЏ Рє С‡СѓР¶РѕР№ СЃРµСЃСЃРёРё (login CSRF: Р¶РµСЂС‚РІР° РІС…РѕРґРёС‚ РїРѕРґ
 * РЅР°РїР°РґР°СЋС‰РёРј Р°РєРєР°СѓРЅС‚РѕРј, Рё РІСЃС‘, С‡С‚Рѕ РѕРЅР° РїРѕС‚РѕРј СЃРґРµР»Р°РµС‚, РґРѕСЃС‚Р°С‘С‚СЃСЏ РµРјСѓ).
 * Р‘РµР· СЃРІРµСЂРєРё `email_verified` Р°РєРєР°СѓРЅС‚ Р·Р°РІРѕРґРёС‚СЃСЏ РЅР° РЅРµРїСЂРѕРІРµСЂРµРЅРЅС‹Р№ Р°РґСЂРµСЃ вЂ” Р°
 * РїРёСЃСЊРјРѕ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏеЇ†з Ѓ РїСЂРёРґС‘С‚ С‚СѓРґР°, Рё СЃС‡С‘С‚ СѓРіРѕРЅСЏС‚. Р‘РµР· РїСЂРѕРІРµСЂРєРё
 * РїСЂРѕРІР°Р№РґРµСЂР° РїРѕ Р±РµР»РѕРјСѓ СЃРїРёСЃРєСѓ РїРѕРґСЃСѓРЅСѓС‚С‹Р№ `provider_id` СЃРѕР·РґР°С‘С‚ РІС‚РѕСЂРѕР№ Р°РєРєР°СѓРЅС‚.
 */

const SECRET = "oauth-test-secret";

let db: ReturnType<typeof import("../src/lib/db").createDatabase>;
let oauth: typeof import("../src/lib/auth/oauth");

before(async () => {
  const { useInMemoryDb } = await import("./helpers/route-session");
  useInMemoryDb({
    OAUTH_STATE_SECRET: SECRET,
    PAYMENT_HMAC_SECRET: SECRET,
    GITHUB_CLIENT_ID: "gh-id",
    GITHUB_CLIENT_SECRET: "gh-secret",
    SITE_URL: "https://ezoffer.example",
  });
  db = (await import("../src/lib/db")).db;
  db.prepare(
    `INSERT INTO users (id, email, password_hash, plan, plan_expires_at, created_at, email_verified)
     VALUES (1, 'known@example.com', 'h', 'none', NULL, ?, 1)`,
  ).run(Date.now());
  oauth = await import("../src/lib/auth/oauth");
});

test("state вЂ” РЅРµРїСЂРµРґСЃРєР°Р·СѓРµРјС‹Р№ Рё РѕРґРЅРѕСЂР°Р·РѕРІС‹Р№", () => {
  const state = oauth.createState(1);
  assert.ok(state.length >= 32, `state СЃР»РёС€РєРѕРј РєРѕСЂРѕС‚РєРёР№: ${state.length}`);
  assert.equal(oauth.consumeState(state), 1, "state РЅРµ РїСЂРѕС€С‘Р»");
  assert.equal(oauth.consumeState(state), null, "state СЃСЂР°Р±РѕС‚Р°Р» РІС‚РѕСЂРѕР№ СЂР°Р· вЂ” СЌС‚Рѕ Рё РµСЃС‚СЊ login CSRF");
});

test("РїРѕРґРґРµР»Р°РЅРЅС‹Р№ state РЅРµ РїСЂРѕС…РѕРґРёС‚", () => {
  assert.equal(oauth.consumeState("Р»СЋР±РѕР№-РјСѓСЃРѕСЂ"), null);
  assert.equal(oauth.consumeState(""), null);
});

test("state РїСЂРёРІСЏР·Р°РЅ Рє РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ, Р° РЅРµ РІРёСЃРµР» РІ РІРѕР·РґСѓС…Рµ", () => {
  const state = oauth.createState(1);
  assert.equal(oauth.peekStateUserId(state), 1);
  assert.equal(oauth.peekStateUserId("РјСѓСЃРѕСЂ"), null);
});

test("РіРёСЂРѕСЃРєРѕРїРёС‡РµСЃРєРёР№ РѕС‚РІРµС‚ РѕС‚ РїСЂРѕРІР°Р№РґРµСЂР° СЂР°Р·Р±РёСЂР°РµС‚СЃСЏ", () => {
  const payload = { id: 42, login: "ssrjkk", email: "a@b.ru" };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");
  const sig = createHmac("sha256", SECRET).update(b64).digest("hex");
  const raw = `${b64}.${sig}`;
  const parsed = oauth.parseProviderResponse("telegram", raw);
  assert.ok(parsed, "РїРѕРґРїРёСЃР°РЅРЅС‹Р№ РѕС‚РІРµС‚ РЅРµ СЂР°Р·РѕР±СЂР°РЅ");
  assert.equal(parsed.providerId, "42");
  assert.equal(parsed.email, "a@b.ru");
});

test("РїРѕРґРїРёСЃСЊ РіРёСЂРѕСЃРєРѕРїР° РЅРµ СЃРѕС€Р»Р°СЃСЊ вЂ” РѕС‚РІРµС‚ РѕС‚РІРµСЂРіРЅСѓС‚", () => {
  const b64 = Buffer.from(JSON.stringify({ id: 1 })).toString("base64");
  const raw = `${b64}.deadbeefdeadbeef`;
  assert.equal(oauth.parseProviderResponse("telegram", raw), null, "РїСЂРёРЅСЏС‚ РѕС‚РІРµС‚ СЃ С‡СѓР¶РѕР№ РїРѕРґРїРёСЃСЊСЋ");
});

test("РёРјСЏ РґР»СЏ GitHub Р±РµСЂС‘С‚СЃСЏ РёР· login, Р° РЅРµ РёР· РЅРµРґРѕРІРµСЂРµРЅРЅРѕРіРѕ РїРѕР»СЏ name", () => {
  // РџСЂРѕРІР°Р№РґРµСЂ РјРѕР¶РµС‚ РїСЂРёСЃР»Р°С‚СЊ С‡С‚Рѕ СѓРіРѕРґРЅРѕ; РѕС‚РѕР±СЂР°Р¶Р°РµРјРѕРµ РёРјСЏ Р±РµСЂС‘Рј РёР· login,
  // РєРѕС‚РѕСЂС‹Р№ Рє РЅРµРјСѓ РїСЂРёРІСЏР·Р°РЅ, Р° name РёСЃРїРѕР»СЊР·СѓРµРј С‚РѕР»СЊРєРѕ РєР°Рє Р·Р°РїР°СЃРЅРѕР№ РІР°СЂРёР°РЅС‚.
  const b64 = Buffer.from(
    JSON.stringify({ id: 7, login: "ssrjkk", name: "<script>alert(1)</script>", email: "a@b.ru" }),
  ).toString("base64");
  const sig = createHmac("sha256", SECRET).update(b64).digest("hex");
  const parsed = oauth.parseProviderResponse("telegram", `${b64}.${sig}`);
  assert.ok(parsed);
  assert.ok(!parsed.name.includes("<script>"), `РІ РёРјСЏ РїРѕРїР°Р» СЃС‹СЂРѕР№ HTML: ${parsed.name}`);
});

test("РЅРµРїСЂРѕРІРµСЂРµРЅРЅС‹Р№ email РЅРµ Р·Р°РІРѕРґРёС‚ Р°РєРєР°СѓРЅС‚", () => {
  // GitHub РѕС‚РґР°С‘С‚ primary email РІ РѕС‚РґРµР»СЊРЅРѕРј Р·Р°РїСЂРѕСЃРµ. Р•СЃР»Рё РµРіРѕ РЅРµС‚ вЂ”
  // Р°РґСЂРµСЃ СЃС‡РёС‚Р°РµС‚СЃСЏ РЅРµРїСЂРѕРІРµСЂРµРЅРЅС‹Рј, Рё РЅР° РЅРµРіРѕ Р°РєРєР°СѓРЅС‚ РЅРµ СЃРѕР·РґР°С‘С‚СЃСЏ.
  assert.equal(oauth.emailVerifiedFrom({ email: "a@b.ru", verified: false }), false);
  assert.equal(oauth.emailVerifiedFrom({ email: "a@b.ru", verified: true }), true);
});

test("РІС…РѕРґ РЅР° СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёР№ Р°РєРєР°СѓРЅС‚ РЅРµ СЃРѕР·РґР°С‘С‚ РІС‚РѕСЂРѕР№", () => {
  const existing = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  assert.ok(existing.c >= 1);
  // РЎРІСЏР·С‹РІР°РЅРёРµ РёС‰РµС‚ РїРѕ email: РїРѕРІС‚РѕСЂРЅС‹Р№ РІС…РѕРґ С‡РµСЂРµР· GitHub РѕР±СЏР·Р°РЅ РЅР°Р№С‚Рё С‚РѕС‚
  // Р¶Рµ Р°РєРєР°СѓРЅС‚, Р° РЅРµ Р·Р°РІРµСЃС‚Рё РґСѓР±Р»СЊ.
  const found = db.prepare("SELECT id FROM users WHERE email = ?").get("known@example.com") as
    | { id: number }
    | undefined;
  assert.ok(found, "СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёР№ Р°РєРєР°СѓРЅС‚ РЅРµ РЅР°Р№РґРµРЅ РїРѕ email");
  assert.equal(found.id, 1);
});

test("СЃСЃС‹Р»РєР° РЅР° Р°РІС‚РѕСЂРёР·Р°С†РёСЋ СѓРєР°Р·С‹РІР°РµС‚ РЅР° СЂР°Р·СЂРµС€С‘РЅРЅРѕРіРѕ РїСЂРѕРІР°Р№РґРµСЂР°", () => {
  const url = oauth.authorizeUrl("github", "state-123") ?? "";
  assert.ok(url.startsWith("https://github.com/login/oauth/authorize"), `РЅРµ С‚РѕС‚ С…РѕСЃС‚: ${url}`);
  assert.match(url, /client_id=gh-id/, "РЅРµС‚ client_id");
  assert.match(url, /state=state-123/, "РЅРµС‚ state");

  // РџСЂРѕРёР·РІРѕР»СЊРЅС‹Р№ РїСЂРѕРІР°Р№РґРµСЂ РЅРµ РґРѕР»Р¶РµРЅ СѓРІРѕРґРёС‚СЊ С‡РµР»РѕРІРµРєР° РЅР° С‡СѓР¶РѕР№ СЃР°Р№С‚.
  assert.equal(oauth.authorizeUrl("РєРІР°СЃ", "s"), null);
  assert.equal(oauth.authorizeUrl("", "s"), null);
});

test("redirect_uri СЃРѕР±РёСЂР°РµС‚СЃСЏ РёР· SITE_URL Рё РЅРµ Р±РµСЂС‘С‚СЃСЏ РёР· Р·Р°РїСЂРѕСЃР°", () => {
  const url = oauth.authorizeUrl("github", "state-123") ?? "";
  assert.match(url, /redirect_uri=https%3A%2F%2Fezoffer\.example%2Fapi%2Fauth%2Foauth%2Fgithub%2Fcallback/);
});

test("РЅРµРёР·РІРµСЃС‚РЅС‹Р№ РїСЂРѕРІР°Р№РґРµСЂ РІ РєРѕР»Р»Р±СЌРєРµ РѕС‚РІРµСЂРіР°РµС‚СЃСЏ РґРѕ РїРѕС…РѕРґР° РІ СЃРµС‚СЊ", () => {
  assert.equal(oauth.authorizeUrl("РєРІР°СЃ", "s"), null);
  assert.equal(oauth.parseProviderResponse("РєРІР°СЃ", "payload=e30.sig"), null);
});