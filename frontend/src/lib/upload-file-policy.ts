const PROFESSOR_UPLOAD_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "txt",
  "md",
  "mp3",
  "wav",
  "ogg",
  "mp4",
  "webm",
  "mov",
] as const;

const PROFESSOR_UPLOAD_MIME_TYPES = new Set<string>([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const QUESTION_MEDIA_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "mp4",
  "webm",
  "mov",
  "mp3",
  "wav",
  "ogg",
] as const;

const QUESTION_MEDIA_MIME_PREFIXES = ["image/", "video/", "audio/"];

const QUESTION_MEDIA_MIME_TYPES = new Set<string>(["application/pdf"]);

const PROFESSOR_UPLOAD_EXTENSIONS_SET = new Set<string>(PROFESSOR_UPLOAD_EXTENSIONS);
const QUESTION_MEDIA_EXTENSIONS_SET = new Set<string>(QUESTION_MEDIA_EXTENSIONS);

export const PROFESSOR_UPLOAD_ACCEPT = PROFESSOR_UPLOAD_EXTENSIONS.map((ext) => `.${ext}`).join(",");
export const QUESTION_MEDIA_ACCEPT = "image/*,video/*,audio/*,.pdf";
export const PROFESSOR_UPLOAD_MAX_BYTES = 200 * 1024 * 1024;

export function getFileExtension(filename: string): string {
  const ext = filename.split(".").pop()?.trim().toLowerCase();
  return ext ?? "";
}

function isMimeAllowed(mimeType: string, allowed: Set<string>): boolean {
  if (!mimeType) return false;
  return allowed.has(mimeType.trim().toLowerCase());
}

function isMimePrefixAllowed(mimeType: string, prefixes: string[]): boolean {
  if (!mimeType) return false;
  const normalized = mimeType.trim().toLowerCase();
  return prefixes.some((prefix) => normalized.startsWith(prefix));
}

export function isProfessorUploadFileAllowed(file: File): boolean {
  const ext = getFileExtension(file.name);
  if (ext && PROFESSOR_UPLOAD_EXTENSIONS_SET.has(ext)) return true;
  return isMimeAllowed(file.type, PROFESSOR_UPLOAD_MIME_TYPES);
}

export function isQuestionMediaFileAllowed(file: File): boolean {
  const ext = getFileExtension(file.name);
  if (ext && QUESTION_MEDIA_EXTENSIONS_SET.has(ext)) return true;
  if (isMimeAllowed(file.type, QUESTION_MEDIA_MIME_TYPES)) return true;
  return isMimePrefixAllowed(file.type, QUESTION_MEDIA_MIME_PREFIXES);
}

