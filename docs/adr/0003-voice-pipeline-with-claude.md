# Voice on the Agent page is a Pipeline with Claude, not end-to-end realtime

The voice conversation on the Agent page is implemented as a pipeline — streaming STT → Claude Sonnet 4.6 → streaming TTS — rather than via an end-to-end realtime stack (OpenAI Realtime, Gemini Live, etc.). Barge-in (User interrupting the agent's TTS, agent stopping and listening) is implemented at the pipeline layer rather than as a native protocol feature.

## Considered options

- **End-to-end realtime stack (GPT-4o-realtime or Gemini Live).** Rejected: would force the Engaged Pass reasoning onto a non-Claude model, breaking persona and quality consistency with the Haiku-class Baseline and Triggered Passes. Also multi-provider, multi-bill, more seams.
- **Turn-based with no barge-in.** Rejected: the conversational "feels alive" quality depends on the User being able to interrupt mid-sentence. Without barge-in the app feels like 2018-era Siri.

## Why

The Engaged Pass is the most consequential reasoning the agent does — proposing relational actions the User will act on. Keeping that on Claude (consistent with the rest of the loop, and with Sonnet's quality) matters more than the last 200ms of latency. A Pipeline with streaming STT, Claude, streaming TTS, and barge-in cancellation feels close enough to true realtime for this use case.

## Consequences

- The voice stack has more moving parts than a single realtime API would.
- Barge-in is implemented as "cancel current TTS stream + interrupt response generation," not as a native protocol feature.
- If Anthropic ships a native end-to-end realtime voice API in the future, this ADR should be revisited.
