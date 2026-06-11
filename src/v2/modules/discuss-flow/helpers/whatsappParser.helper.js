const INVISIBLE_CHAR_RE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;
const DASH_CHARS = '-\u2010-\u2015\u2212';

const DATE_PART = String.raw`\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}`;
const TIME_PART = String.raw`\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?`;
const TIMESTAMP_PART = `${DATE_PART},\\s*${TIME_PART}`;
const NAME_PART = String.raw`[A-Za-z][\w .'"()-]{0,80}`;
const SHORT_NAME_PART = String.raw`[A-Za-z][\w.'-]*(?:\s+[A-Za-z][\w.'-]*){0,2}`;

const BRACKET_LINE_RE = new RegExp(
  String.raw`^\[(${TIMESTAMP_PART})\]\s*([^:]+):\s*(.*)$`,
  'i'
);
const BRACKET_NO_COLON_RE = new RegExp(
  String.raw`^\[(${TIMESTAMP_PART})\]\s*(${NAME_PART})\s+(.+)$`,
  'i'
);
const DASH_LINE_RE = new RegExp(
  String.raw`^(${TIMESTAMP_PART})\s*[${DASH_CHARS}]\s*([^:]+):\s*(.*)$`,
  'i'
);
const DASH_NAME_DASH_CONTENT_RE = new RegExp(
  String.raw`^(${TIMESTAMP_PART})\s*[${DASH_CHARS}]\s*([^${DASH_CHARS}:]{1,80}?)\s*[${DASH_CHARS}]\s*(.*)$`,
  'i'
);
const DASH_NAME_SPACE_CONTENT_RE = new RegExp(
  String.raw`^(${TIMESTAMP_PART})\s*[${DASH_CHARS}]\s*([A-Za-z][\w.'-]*)\s+(.+)$`,
  'i'
);
const MEETING_LINE_RE = /^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)\]?\s*([^:]{1,120}):\s*(.*)$/i;
const MARKDOWN_BOLD_LINE_RE = /^\*\*([^*]{1,120})\*\*[:\s]+(.+)$/;
const PLAIN_LINE_RE = /^([^:]{1,120}):\s*(.+)$/;
const BULLET_LINE_RE = /^[-*•]\s*([^:]{1,120}):\s*(.+)$/;
const SPEAKER_TIMESTAMP_LINE_RE = /^(.{1,80}?)\s+((?:\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)|(?:\(\d{1,2}:\d{2}(?::\d{2})?\))|(?:\d+\s*(?:min(?:ute)?s?|sec(?:ond)?s?)))\s*$/i;
const SHORT_SPEAKER_NAME_RE = /^[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3}$/;

function normalizeLine(line) {
  return String(line || '')
    .replace(INVISIBLE_CHAR_RE, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function parseTimestamp(raw) {
  if (!raw) return null;
  const normalized = String(raw)
    .trim()
    .replace(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/, (_m, m, d, y) => {
      const year = y.length === 2 ? `20${y}` : y;
      return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    });
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function matchMessageLine(line) {
  const trimmed = normalizeLine(line);
  if (!trimmed) return null;

  const bracket = trimmed.match(BRACKET_LINE_RE);
  if (bracket) {
    return {
      timestamp: bracket[1],
      senderName: bracket[2].trim(),
      content: bracket[3],
      format: 'whatsapp_bracket',
    };
  }

  const bracketNoColon = trimmed.match(BRACKET_NO_COLON_RE);
  if (bracketNoColon) {
    return {
      timestamp: bracketNoColon[1],
      senderName: bracketNoColon[2].trim(),
      content: bracketNoColon[3],
      format: 'whatsapp_bracket',
    };
  }

  const dash = trimmed.match(DASH_LINE_RE);
  if (dash) {
    return {
      timestamp: dash[1],
      senderName: dash[2].trim(),
      content: dash[3],
      format: 'whatsapp_dash',
    };
  }

  const dashNameDash = trimmed.match(DASH_NAME_DASH_CONTENT_RE);
  if (dashNameDash) {
    return {
      timestamp: dashNameDash[1],
      senderName: dashNameDash[2].trim(),
      content: dashNameDash[3],
      format: 'whatsapp_dash',
    };
  }

  const dashNameSpace = trimmed.match(DASH_NAME_SPACE_CONTENT_RE);
  if (dashNameSpace) {
    return {
      timestamp: dashNameSpace[1],
      senderName: dashNameSpace[2].trim(),
      content: dashNameSpace[3],
      format: 'whatsapp_dash',
    };
  }

  if (SPEAKER_TIMESTAMP_LINE_RE.test(trimmed)) {
    return null;
  }

  const meeting = trimmed.match(MEETING_LINE_RE);
  if (meeting) {
    return {
      timestamp: meeting[1],
      senderName: meeting[2].trim(),
      content: meeting[3],
      format: 'meeting',
    };
  }

  const markdownBold = trimmed.match(MARKDOWN_BOLD_LINE_RE);
  if (markdownBold) {
    return {
      timestamp: null,
      senderName: markdownBold[1].trim(),
      content: markdownBold[2],
      format: 'plain',
    };
  }

  const bullet = trimmed.match(BULLET_LINE_RE);
  if (bullet && !looksLikeUrlLine(bullet[1], bullet[2])) {
    return {
      timestamp: null,
      senderName: bullet[1].trim(),
      content: bullet[2],
      format: 'plain',
    };
  }

  const plain = trimmed.match(PLAIN_LINE_RE);
  if (plain && !looksLikeUrlLine(plain[1], plain[2])) {
    return {
      timestamp: null,
      senderName: plain[1].trim(),
      content: plain[2],
      format: 'plain',
    };
  }

  return null;
}

function looksLikeUrlLine(senderCandidate, contentCandidate) {
  const sender = String(senderCandidate || '').trim().toLowerCase();
  const content = String(contentCandidate || '').trim().toLowerCase();
  if (sender.startsWith('http') || sender.startsWith('www.')) return true;
  if (/^\/\//.test(sender)) return true;
  if (content.startsWith('//') && sender.length < 4) return true;
  return false;
}

function pushMessage(messages, current) {
  if (current) messages.push(current);
}

function buildMessage(matched, index) {
  const parsedAt = matched.timestamp ? parseTimestamp(matched.timestamp) : null;
  return {
    ref: `line-${index + 1}`,
    senderName: matched.senderName,
    content: matched.content || '',
    originalTimestamp: matched.timestamp,
    createdAt: parsedAt,
    format: matched.format,
  };
}

function hasUpcomingContentLine(lines, startIndex) {
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const normalized = normalizeLine(lines[i]);
    if (!normalized) continue;
    return !matchMessageLine(lines[i]);
  }
  return false;
}

function looksLikeSpeakerHeader(line) {
  const trimmed = normalizeLine(line);
  if (!trimmed || trimmed.length > 80) return false;
  if (matchMessageLine(line)) return false;
  if (SPEAKER_TIMESTAMP_LINE_RE.test(trimmed)) return true;
  return SHORT_SPEAKER_NAME_RE.test(trimmed) && trimmed.split(/\s+/).length <= 4;
}

function parseSpeakerBlocks(rawText) {
  const lines = String(rawText || '').split(/\r?\n/);
  const messages = [];
  const parseWarnings = [];
  const participantSet = new Set();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = normalizeLine(line);
    if (!trimmed) {
      i += 1;
      continue;
    }

    const speakerMatch = trimmed.match(SPEAKER_TIMESTAMP_LINE_RE);
    const isSpeakerHeader = speakerMatch || (looksLikeSpeakerHeader(line) && hasUpcomingContentLine(lines, i));

    if (!isSpeakerHeader) {
      i += 1;
      continue;
    }

    const senderName = speakerMatch ? speakerMatch[1].trim() : trimmed;
    const timestamp = speakerMatch ? speakerMatch[2] : null;
    i += 1;

    while (i < lines.length && !normalizeLine(lines[i])) {
      i += 1;
    }
    if (i >= lines.length) break;

    let content = normalizeLine(lines[i]);
    i += 1;

    while (i < lines.length) {
      const nextTrimmed = normalizeLine(lines[i]);
      if (!nextTrimmed) {
        i += 1;
        continue;
      }
      if (matchMessageLine(lines[i]) || looksLikeSpeakerHeader(lines[i])) break;
      content = `${content}\n${nextTrimmed}`;
      i += 1;
    }

    const message = buildMessage({
      timestamp,
      senderName,
      content,
      format: 'speaker_block',
    }, messages.length);
    messages.push(message);
    participantSet.add(message.senderName);
  }

  return {
    participants: [...participantSet],
    messages,
    parseWarnings,
  };
}

function parseUnstructuredFallback(rawText) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) {
    return { participants: [], messages: [], parseWarnings: [] };
  }

  const speakerBlocks = parseSpeakerBlocks(rawText);
  if (speakerBlocks.messages.length) {
    return {
      ...speakerBlocks,
      parseWarnings: [
        { line: 0, message: 'Parsed using speaker-block fallback (name line + message line)' },
        ...speakerBlocks.parseWarnings,
      ],
    };
  }

  const blocks = trimmed.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  const messages = [];
  const participantSet = new Set(['Imported']);
  const parseWarnings = [{
    line: 0,
    message: blocks.length > 1
      ? 'Parsed using paragraph fallback; speakers assigned as Imported'
      : 'Parsed using line-by-line fallback; speakers assigned as Imported',
  }];

  if (blocks.length > 1) {
    blocks.forEach((block, index) => {
      messages.push(buildMessage({
        senderName: 'Imported',
        content: block,
        format: 'fallback_block',
      }, index));
    });
  } else {
    trimmed.split(/\r?\n/)
      .map(normalizeLine)
      .filter(Boolean)
      .forEach((line, index) => {
        messages.push(buildMessage({
          senderName: 'Imported',
          content: line,
          format: 'fallback_line',
        }, index));
      });
  }

  return {
    participants: [...participantSet],
    messages,
    parseWarnings,
  };
}

function parseLines(rawText, { allowPlain = true } = {}) {
  const lines = String(rawText || '').split(/\r?\n/);
  const messages = [];
  const parseWarnings = [];
  const participantSet = new Set();
  let current = null;

  lines.forEach((line, index) => {
    const matched = matchMessageLine(line);

    if (matched) {
      if (matched.format === 'plain' && !allowPlain) {
        if (line.trim()) {
          parseWarnings.push({ line: index + 1, message: 'Unparsed line without preceding message header' });
        }
        return;
      }

      pushMessage(messages, current);
      current = buildMessage(matched, index);
      participantSet.add(current.senderName);
      return;
    }

    if (!current) {
      if (line.trim()) {
        parseWarnings.push({ line: index + 1, message: 'Unparsed line without preceding message header' });
      }
      return;
    }

    const continuation = normalizeLine(line);
    current.content = current.content
      ? `${current.content}\n${continuation || line}`
      : (continuation || line);
  });

  pushMessage(messages, current);

  return {
    participants: [...participantSet],
    messages,
    parseWarnings,
  };
}

function parseWhatsAppChat(rawText) {
  const strict = parseLines(rawText, { allowPlain: false });
  if (strict.messages.length) {
    return strict;
  }
  const plain = parseLines(rawText, { allowPlain: true });
  if (plain.messages.length) {
    return plain;
  }
  return parseUnstructuredFallback(rawText);
}

function parseImportChat(rawText, sourceType = 'whatsapp') {
  if (sourceType === 'meeting_transcript') {
    const speakerBlocks = parseSpeakerBlocks(rawText);
    if (speakerBlocks.messages.length) {
      return speakerBlocks;
    }
  }

  if (['manual_paste', 'meeting_transcript', 'other', 'email', 'slack'].includes(sourceType)) {
    const plainFirst = parseLines(rawText, { allowPlain: true });
    if (plainFirst.messages.length) {
      return plainFirst;
    }
    const strict = parseLines(rawText, { allowPlain: false });
    if (strict.messages.length) {
      return strict;
    }
    return parseUnstructuredFallback(rawText);
  }

  return parseWhatsAppChat(rawText);
}

module.exports = {
  parseWhatsAppChat,
  parseImportChat,
  matchMessageLine,
  parseTimestamp,
  normalizeLine,
  parseUnstructuredFallback,
  parseSpeakerBlocks,
};
