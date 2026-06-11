module.exports = {
  'discussflow.summarizeTopic': {
    system: 'You summarize discussion threads. Return JSON only.',
    user: 'Summarize the topic and key points. Context: {{context}}. Input: {{input}}. Return {"summary":"...","topics":[]}',
  },
  'discussflow.importChat': {
    system: 'You analyze imported discussion text for a project topic. The input includes source_type (whatsapp, slack, email, meeting_transcript, manual_paste, other) and raw_text. Treat raw_text as the source of truth. Interpret formatting according to source_type — e.g. whatsapp exports, meeting speaker lines, email threads, slack transcripts, or free-form notes. parsed_messages are optional parser hints and may be incomplete; re-read raw_text yourself. AI suggests only — humans approve. Return JSON only.',
    user: 'Using source_type and raw_text from the input, interpret the discussion then extract summary, requirements, questions, decisions, risks, task candidates, and next actions. Link items to parsed message ids/refs when confident; otherwise use import-raw or leave linked_message_refs empty. Context: {{context}}. Input: {{input}}. Return {"summary":{"title":"","content":"","key_points":[],"confidence":0.8,"linked_message_refs":[]},"requirements":[{"title":"","description":"","priority":"medium","confidence":0.7,"linked_message_refs":[]}],"questions":[{"question":"","context":"","confidence":0.7,"linked_message_refs":[]}],"decisions":[{"title":"","context":"","impact":"","confidence":0.7,"linked_message_refs":[]}],"risks":[{"title":"","description":"","confidence":0.6,"linked_message_refs":[]}],"task_candidates":[{"title":"","description":"","priority":"medium","confidence":0.6,"linked_message_refs":[]}],"next_actions":[{"title":"","description":"","priority":"medium","confidence":0.6,"linked_message_refs":[]}]}',
  },
  'discussflow.analyzeMessage': {
    system: 'You analyze a single discussion message and extract reviewable suggestions. Return JSON only.',
    user: 'Analyze this message for actionable suggestions. Context: {{context}}. Input: {{input}}. Return {"summary":{"title":"","content":"","key_points":[],"confidence":0.7,"linked_message_refs":[]},"requirements":[],"questions":[],"decisions":[],"risks":[],"task_candidates":[],"next_actions":[]}',
  },
  'discussflow.extractRequirements': {
    system: 'You extract software requirements from discussions. Return JSON only.',
    user: 'Extract requirements with priority. Context: {{context}}. Input: {{input}}. Return {"requirements":[{"text":"","priority":"medium"}]}',
  },
  'discussflow.generateDocument': {
    system: 'You generate professional truth-layer documents from approved discussion context. Return JSON only. Do not lock or finalize — produce a draft only.',
    user: 'Generate a document draft. Context: {{context}}. Input: {{input}}. Return {"title":"","document_type":"","content_markdown":"","sections":[],"linked_requirement_refs":[],"linked_decision_refs":[],"unresolved_questions":[],"assumptions":[]}',
  },
};
