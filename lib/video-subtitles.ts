export type TimedSubtitleSegment = {
  start: number;
  end: number;
  text: string;
};

const MIN_SEGMENT_SECONDS = 1.5;
const MAX_SEGMENT_SECONDS = 6;
const DEFAULT_CHARS_PER_SECOND = 4.5;

function getCharacterLength(value: string) {
  return Array.from(value).length;
}

function cleanSubtitleText(script: string) {
  return script
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[{}[\]"'`*_#>|~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(script: string) {
  const cleaned = cleanSubtitleText(script);
  if (!cleaned) return [];

  const matches = cleaned.match(/[^。！？；，!?;,]+[。！？；，!?;,]?/g) || [cleaned];
  return matches
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function formatTimestamp(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.round((safeSeconds - Math.floor(safeSeconds)) * 1000);

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    `${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`
  ].join(":");
}

export function estimateSubtitleDuration(script: string) {
  const length = Math.max(1, getCharacterLength(cleanSubtitleText(script)));
  return Math.max(8, Math.ceil(length / DEFAULT_CHARS_PER_SECOND));
}

export function generateTimedSegments(script: string, durationSeconds: number): TimedSubtitleSegment[] {
  const sentences = splitSentences(script);
  if (!sentences.length) return [];

  const totalDuration = Math.max(0.1, durationSeconds);
  const minSegmentSeconds = Math.min(MIN_SEGMENT_SECONDS, totalDuration / sentences.length);
  const weights = sentences.map((sentence) => Math.max(1, getCharacterLength(sentence)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  let cursor = 0;
  return sentences.map((sentence, index) => {
    const remainingSegments = sentences.length - index;
    const remainingDuration = Math.max(0, totalDuration - cursor);
    const weightedDuration = totalDuration * (weights[index] / totalWeight);
    const maxAllowed = Math.max(minSegmentSeconds, remainingDuration - minSegmentSeconds * (remainingSegments - 1));
    const segmentDuration = index === sentences.length - 1
      ? remainingDuration
      : Math.min(Math.max(weightedDuration, minSegmentSeconds), Math.min(MAX_SEGMENT_SECONDS, maxAllowed));
    const start = cursor;
    const end = Math.min(totalDuration, start + Math.max(minSegmentSeconds, segmentDuration));
    cursor = end;

    return {
      start,
      end,
      text: sentence
    };
  }).filter((segment) => segment.end > segment.start);
}

export function generateWebVtt(script: string, durationSeconds?: number) {
  const cleaned = cleanSubtitleText(script);
  if (!cleaned) return { vtt: "", timedSegments: [] as TimedSubtitleSegment[] };

  const totalDuration = durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : estimateSubtitleDuration(cleaned);
  const timedSegments = generateTimedSegments(cleaned, totalDuration);
  if (!timedSegments.length) return { vtt: "", timedSegments };

  const cues = timedSegments.map((segment) => [
    `${formatTimestamp(segment.start)} --> ${formatTimestamp(segment.end)}`,
    segment.text
  ].join("\n"));

  return {
    vtt: `WEBVTT\n\n${cues.join("\n\n")}\n`,
    timedSegments
  };
}
