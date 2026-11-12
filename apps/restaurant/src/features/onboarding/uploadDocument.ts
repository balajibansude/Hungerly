import { ApiError, DocumentSchema, isApiError, paths } from '@hungerly/api-client';
import { File } from 'expo-file-system';

import { api, IS_PROTOTYPE_MODE } from '@/lib/api';

/** MIME type for a picked document, from its file name (the API accepts PDF, JPEG and PNG). */
function documentMimeType(name: string | null): string {
  const ext = name?.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/pdf';
}

/** Uploads a picked document to the branch (multipart). Simulated in prototype mode. */
export async function uploadBranchDocument(
  branchId: string,
  type: 'fssai_license' | 'bank_proof',
  file: { uri: string; name: string | null },
  fields: Record<string, string> = {},
): Promise<void> {
  if (IS_PROTOTYPE_MODE) {
    await new Promise((r) => setTimeout(r, 400));
    return;
  }
  const name = file.name ?? 'document.pdf';
  // Read the picked file first, so a bad URI or unreadable file is reported as such instead of
  // failing inside fetch (where it would look like a connection error).
  let bytes: Uint8Array;
  try {
    bytes = await new File(file.uri).bytes();
  } catch (cause) {
    if (__DEV__) console.error('[upload] could not read picked file', file.uri, cause);
    throw new ApiError(0, 'network', `Could not read the selected file. Please pick it again.${devDetail(cause)}`);
  }
  if (bytes.length === 0) throw new ApiError(0, 'network', 'The selected file is empty. Please pick another file.');

  const form = new FormData();
  form.append('type', type);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  // Expo replaces global fetch with expo/fetch, which rejects React Native's { uri } file parts
  // before sending anything (surfacing as a network error). It accepts parts that expose bytes().
  form.append('file', { name, type: documentMimeType(name), bytes: async () => bytes } as unknown as Blob);
  try {
    await api.request('POST', paths.partner.documents(branchId), { schema: DocumentSchema, form });
  } catch (error) {
    // A 'network' error here means fetch failed before any response: show the real cause in dev.
    if (__DEV__ && isApiError(error) && error.code === 'network') {
      console.error('[upload] document request failed before reaching the API', error.cause);
      throw new ApiError(0, 'network', `${error.message}${devDetail(error.cause)}`);
    }
    throw error;
  }
}

/** The underlying error, appended to user-facing messages in development builds only. */
function devDetail(cause: unknown): string {
  if (!__DEV__) return '';
  const text = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  return `\n[dev] ${text}`;
}
