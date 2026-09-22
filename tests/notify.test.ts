import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildNewOrderTelegramMessage,
  escapeHtml,
  isTelegramConfigured,
} from "../lib/notify/message.ts";

const ORDER_ID = "22222222-3333-4444-5555-666666666666";

describe("buildNewOrderTelegramMessage", () => {
  it("includes order number, customer, governorate and total", () => {
    const message = buildNewOrderTelegramMessage({
      orderId: ORDER_ID,
      customerName: "أحمد محمد",
      phone: "01012345678",
      governorate: "القاهرة",
      city: "مدينة نصر",
      total: 435,
    });

    assert.match(message, /22222222/);
    assert.match(message, /أحمد محمد/);
    assert.match(message, /01012345678/);
    assert.match(message, /القاهرة/);
    assert.match(message, /مدينة نصر/);
    assert.match(message, /435\.00 ج\.م/);
    assert.match(message, new RegExp(ORDER_ID));
  });

  it("escapes HTML in user-provided fields", () => {
    const message = buildNewOrderTelegramMessage({
      orderId: ORDER_ID,
      customerName: "<script>alert(1)</script>",
      phone: "01000000000",
      governorate: 'A&B "quote"',
      city: "<b>City</b>",
      total: 100,
    });

    assert.ok(!message.includes("<script>"));
    assert.match(message, /&lt;script&gt;/);
    assert.match(message, /A&amp;B/);
    assert.match(message, /&quot;/);
  });

  it("keeps the admin link intact and handles a missing governorate", () => {
    const message = buildNewOrderTelegramMessage({
      orderId: ORDER_ID,
      customerName: "علي",
      phone: "01000000000",
      governorate: null,
      city: "المنيا",
      total: 150,
    });

    assert.match(message, /https:\/\/trad-mart\.vercel\.app\/admin\/orders\//);
    assert.match(message, /—/);
  });
});

describe("escapeHtml", () => {
  it("escapes &, <, > and double quotes", () => {
    assert.equal(escapeHtml(`<a "x" & 'y'>`), "&lt;a &quot;x&quot; &amp; 'y'&gt;");
  });
});

describe("isTelegramConfigured", () => {
  const savedToken = process.env.TELEGRAM_BOT_TOKEN;
  const savedChat = process.env.TELEGRAM_CHAT_ID;

  it("requires both token and chat id to be non-empty", () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    assert.equal(isTelegramConfigured(), false);

    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    assert.equal(isTelegramConfigured(), false);

    process.env.TELEGRAM_CHAT_ID = "-100123";
    assert.equal(isTelegramConfigured(), true);

    process.env.TELEGRAM_BOT_TOKEN = "";
    assert.equal(isTelegramConfigured(), false);
  });

  if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = savedToken;
  if (savedChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
  else process.env.TELEGRAM_CHAT_ID = savedChat;
});