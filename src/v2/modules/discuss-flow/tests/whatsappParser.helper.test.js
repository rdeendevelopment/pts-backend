const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseWhatsAppChat,
  parseImportChat,
  matchMessageLine,
  normalizeLine,
} = require('../helpers/whatsappParser.helper');

describe('whatsappParser.helper', () => {
  it('parses bracket WhatsApp format', () => {
    const raw = `[06/06/2026, 5:01:15 PM] Cristian: We have things to do
[06/06/2026, 5:02:01 PM] Usama Ilyas: Yes you are right`;

    const parsed = parseWhatsAppChat(raw);
    assert.equal(parsed.messages.length, 2);
    assert.equal(parsed.participants.length, 2);
    assert.equal(parsed.messages[0].senderName, 'Cristian');
    assert.equal(parsed.messages[0].content, 'We have things to do');
    assert.equal(parsed.messages[1].senderName, 'Usama Ilyas');
  });

  it('parses dash WhatsApp format', () => {
    const raw = `06/06/2026, 5:01 PM - Cristian: First point
6/6/26, 17:01 - Usama Ilyas: Second point`;

    const parsed = parseWhatsAppChat(raw);
    assert.equal(parsed.messages.length, 2);
    assert.equal(parsed.messages[0].senderName, 'Cristian');
    assert.equal(parsed.messages[1].senderName, 'Usama Ilyas');
  });

  it('appends multiline content to previous message', () => {
    const raw = `[06/06/2026, 5:01:15 PM] Cristian: Line one
still part of message
[06/06/2026, 5:02:01 PM] Usama Ilyas: Reply`;

    const parsed = parseWhatsAppChat(raw);
    assert.equal(parsed.messages.length, 2);
    assert.match(parsed.messages[0].content, /Line one/);
    assert.match(parsed.messages[0].content, /still part of message/);
  });

  it('records warnings for invalid leading lines', () => {
    const raw = `orphan line without header
[06/06/2026, 5:01:15 PM] Cristian: Valid`;

    const parsed = parseWhatsAppChat(raw);
    assert.equal(parsed.parseWarnings.length, 1);
    assert.equal(parsed.messages.length, 1);
  });

  it('matches line parser directly', () => {
    const row = matchMessageLine('[06/06/2026, 5:01:15 PM] Cristian: Hello');
    assert.ok(row);
    assert.equal(row.senderName, 'Cristian');
    assert.equal(row.content, 'Hello');
  });

  it('parses lines with invisible unicode prefix from WhatsApp copy', () => {
    const raw = `\u200E[06/06/2026, 5:01:15 PM] Cristian: Copied from phone
\u200E[06/06/2026, 5:02:01 PM] Usama Ilyas: Works now`;

    const parsed = parseWhatsAppChat(raw);
    assert.equal(parsed.messages.length, 2);
    assert.equal(parsed.messages[0].senderName, 'Cristian');
  });

  it('parses dash format with en dash separator and dot dates', () => {
    const raw = `06.06.2026, 5:01 PM – Cristian: Dot date message
06.06.2026, 5:02 PM - Usama Ilyas: Reply`;

    const parsed = parseWhatsAppChat(raw);
    assert.equal(parsed.messages.length, 2);
    assert.equal(parsed.messages[0].senderName, 'Cristian');
  });

  it('falls back to plain Name: message conversation format', () => {
    const raw = `Cristian: We need SSO by Friday
Usama Ilyas: Agreed, I will draft requirements
Cristian: Also capture open questions`;

    const parsed = parseWhatsAppChat(raw);
    assert.equal(parsed.messages.length, 3);
    assert.equal(parsed.parseWarnings.length, 0);
    assert.equal(parsed.messages[1].content, 'Agreed, I will draft requirements');
  });

  it('parseImportChat prefers plain format for manual_paste source', () => {
    const raw = `Product Manager: Scope is auth only
Engineer: Need API contract`;

    const parsed = parseImportChat(raw, 'manual_paste');
    assert.equal(parsed.messages.length, 2);
  });

  it('normalizes invisible characters before matching', () => {
    const normalized = normalizeLine('\u200E\uFEFF[06/06/2026, 5:01:15 PM] Cristian: Hi');
    assert.match(normalized, /^\[06\/06\/2026/);
  });

  it('parses UI placeholder dash format with colon after name', () => {
    const raw = `12/05/2026, 10:14 AM - Client: Can we approve login by email?
12/05/2026, 10:17 AM - Team: Yes, requirement noted.`;

    const parsed = parseImportChat(raw, 'whatsapp');
    assert.equal(parsed.messages.length, 2);
    assert.equal(parsed.messages[0].senderName, 'Client');
    assert.equal(parsed.parseWarnings.length, 0);
  });

  it('parses dash format when message is separated by a second dash', () => {
    const raw = '12/05/2026, 10:14 AM - Client - Can we approve login by email?';

    const parsed = parseImportChat(raw, 'whatsapp');
    assert.equal(parsed.messages.length, 1);
    assert.equal(parsed.messages[0].senderName, 'Client');
    assert.equal(parsed.messages[0].content, 'Can we approve login by email?');
  });

  it('parses dash format without colon between name and message', () => {
    const raw = '12/05/2026, 10:14 AM - Client Can we approve login by email?';

    const parsed = parseImportChat(raw, 'whatsapp');
    assert.equal(parsed.messages.length, 1);
    assert.equal(parsed.messages[0].senderName, 'Client');
  });

  it('parses speaker block transcripts', () => {
    const raw = `John Smith  0:05
Hello everyone

Jane Doe  1:12
We need SSO`;

    const parsed = parseImportChat(raw, 'meeting_transcript');
    assert.equal(parsed.messages.length, 2);
    assert.equal(parsed.messages[0].senderName, 'John Smith');
    assert.match(parsed.messages[0].content, /Hello everyone/);
  });

  it('falls back to paragraph import for unstructured notes', () => {
    const raw = `Discussion about login

We need email login
Client wants approval flow`;

    const parsed = parseImportChat(raw, 'whatsapp');
    assert.equal(parsed.messages.length, 2);
    assert.equal(parsed.messages[0].senderName, 'Imported');
    assert.equal(parsed.parseWarnings[0].message, 'Parsed using paragraph fallback; speakers assigned as Imported');
  });

  it('falls back to line-by-line import when no paragraph breaks exist', () => {
    const raw = `We need email login
Client wants approval flow
Team will draft requirements`;

    const parsed = parseImportChat(raw, 'whatsapp');
    assert.equal(parsed.messages.length, 3);
    assert.equal(parsed.messages[0].senderName, 'Imported');
    assert.equal(parsed.parseWarnings[0].message, 'Parsed using line-by-line fallback; speakers assigned as Imported');
  });
});
