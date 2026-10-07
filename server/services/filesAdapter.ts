import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { getGenAI, recordGeminiCall } from "../gemini/client";

export interface TransientFileResult<T> {
  result: T;
  uploadedFileName?: string;
  latencyMs: number;
}

/**
 * Transient Files API Adapter:
 * Uploads large payloads (>10-15MB or streaming media) temporarily to Gemini Files API,
 * runs the model operation, and rigorously deletes the remote file in a finally block
 * to zero out persistent storage costs and avoid quota accumulation.
 */
export async function withTransientGeminiFile<T>(
  buffer: Buffer,
  mimeType: string,
  originalFileName: string,
  operation: (fileRef: any) => Promise<T>
): Promise<T> {
  const ai = getGenAI();
  if (!ai) {
    throw new Error("Gemini AI client not initialized");
  }

  // Create local temp file
  const ext = path.extname(originalFileName) || (mimeType.includes("pdf") ? ".pdf" : ".tmp");
  const tempFileName = `vault-gemini-${crypto.randomUUID()}${ext}`;
  const tempFilePath = path.join(os.tmpdir(), tempFileName);

  fs.writeFileSync(tempFilePath, buffer);

  let uploadedFile: any = null;
  const startTime = Date.now();

  try {
    console.log(`[FilesAdapter] Uploading transient file to Gemini: ${originalFileName} (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)...`);
    
    uploadedFile = await ai.files.upload({
      file: tempFilePath,
      config: {
        mimeType,
      },
    });

    console.log(`[FilesAdapter] Upload complete: ${uploadedFile.name}. Executing inference...`);

    const result = await operation(uploadedFile);
    return result;
  } finally {
    // 1. Delete remote Gemini File storage
    if (uploadedFile?.name) {
      try {
        console.log(`[FilesAdapter] Deleting remote file: ${uploadedFile.name}...`);
        await ai.files.delete({ name: uploadedFile.name });
        console.log(`[FilesAdapter] Remote file ${uploadedFile.name} purged successfully.`);
      } catch (err: any) {
        console.warn(`[FilesAdapter] Failed to delete remote Gemini file ${uploadedFile.name}:`, err?.message);
      }
    }

    // 2. Clean up local temp file
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (cleanupErr: any) {
      console.warn(`[FilesAdapter] Failed to delete local temp file ${tempFilePath}:`, cleanupErr?.message);
    }
  }
}

/**
 * Transcribes audio files via the transient Files API.
 * Ideal for files > 10MB or longer recordings where inline base64 is inefficient.
 */
export async function transcribeAudioWithFilesApi(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  timeoutMs = 60000
): Promise<string> {
  const ai = getGenAI();
  if (!ai) return "";

  const audioModels = ["gemini-3.5-transcribe", "gemini-3.7-flash", "gemini-flash-latest"];
  const transcriptionPrompt = `Accurately transcribe all spoken speech, dialogues, and technical discussions from this audio recording ("${fileName}"). Output the full verbatim transcription in the original spoken language. Use clear paragraphs and proper punctuation. Do not invent details or truncate.`;

  return await withTransientGeminiFile(buffer, mimeType, fileName, async (fileRef) => {
    for (const model of audioModels) {
      const startMs = Date.now();
      try {
        console.log(`[FilesAdapter Audio] Calling ${model} for file ${fileRef.name}...`);
        const response = await ai.models.generateContent({
          model,
          contents: [
            fileRef,
            { text: transcriptionPrompt },
          ],
        });

        const text = response?.text?.trim() || "";
        if (text.length > 0) {
          recordGeminiCall({
            endpoint: "transcribe-files-api",
            model,
            latencyMs: Date.now() - startMs,
            status: "success",
            statusCode: 200,
          });
          return text;
        }
      } catch (err: any) {
        console.warn(`[FilesAdapter Audio] Model ${model} failed:`, err?.message);
      }
    }
    return "";
  });
}
