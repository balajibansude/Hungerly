/**
 * The registration document upload: reads the picked file's bytes and sends them as the
 * multipart `file` part (with `type` and `documentNumber`) to the documents endpoint.
 */
import { paths } from '@hungerly/api-client';
import { convertFormDataAsync } from 'expo/src/winter/fetch/convertFormData';
import { installFormDataPatch } from 'expo/src/winter/FormData';

// Match the device: React Native's FormData with Expo's patch (Node's FormData stringifies parts).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RNFormData = require('react-native/Libraries/Network/FormData').default as typeof FormData;
installFormDataPatch(RNFormData);
globalThis.FormData = RNFormData;

const mockRequest = jest.fn();
const mockBytes = jest.fn();
const constructedUris: string[] = [];

jest.mock('@/lib/api', () => ({
  IS_PROTOTYPE_MODE: false,
  api: { request: (...args: unknown[]) => mockRequest(...args) },
}));

jest.mock('expo-file-system', () => ({
  File: class {
    constructor(uri: string) {
      constructedUris.push(uri);
    }
    bytes() {
      return mockBytes();
    }
  },
}));

// eslint-disable-next-line import/first
import { uploadBranchDocument } from './uploadDocument';

const BRANCH = '00000000-0000-4000-8000-000000000001';
const URI = 'content://com.android.providers.downloads.documents/document/42';
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"

beforeEach(() => {
  mockRequest.mockReset().mockResolvedValue({});
  mockBytes.mockReset().mockResolvedValue(PDF);
  constructedUris.length = 0;
});

it('sends the picked file bytes as multipart to the documents endpoint', async () => {
  await uploadBranchDocument(BRANCH, 'fssai_license', { uri: URI, name: 'licence.pdf' }, { documentNumber: '12345678901234' });

  expect(constructedUris).toEqual([URI]);
  expect(mockRequest).toHaveBeenCalledTimes(1);
  const [method, path, opts] = mockRequest.mock.calls[0];
  expect(method).toBe('POST');
  expect(path).toBe(paths.partner.documents(BRANCH));
  expect(opts.body).toBeUndefined();

  // Encode the stored parts with expo/fetch's own multipart encoder, as on device. (Under Jest the
  // patched entries() generator is not iterable, so the parts are handed over directly.)
  const parts = (opts.form as unknown as { _parts: [string, unknown][] })._parts;
  const { body, boundary } = await convertFormDataAsync({ entries: () => parts } as unknown as FormData);
  const text = new TextDecoder('latin1').decode(body);
  expect(text).toContain('content-disposition: form-data; name="type"\r\n\r\nfssai_license\r\n');
  expect(text).toContain('content-disposition: form-data; name="documentNumber"\r\n\r\n12345678901234\r\n');
  expect(text).toContain(
    'content-disposition: form-data; name="file"; filename="licence.pdf"\r\ncontent-type: application/pdf\r\n\r\n%PDF-1.7\r\n',
  );
  expect(text.endsWith(`--${boundary}--\r\n`)).toBe(true);
});

it('reports an unreadable file instead of sending a request', async () => {
  mockBytes.mockRejectedValue(new Error("Missing 'READ' permission for accessing the file."));

  await expect(
    uploadBranchDocument(BRANCH, 'bank_proof', { uri: URI, name: 'cheque.jpg' }),
  ).rejects.toMatchObject({ message: expect.stringContaining('Could not read the selected file') });
  expect(mockRequest).not.toHaveBeenCalled();
});

it('rejects an empty file before uploading', async () => {
  mockBytes.mockResolvedValue(new Uint8Array());

  await expect(
    uploadBranchDocument(BRANCH, 'fssai_license', { uri: URI, name: null }, { documentNumber: '12345678901234' }),
  ).rejects.toMatchObject({ message: expect.stringContaining('empty') });
  expect(mockRequest).not.toHaveBeenCalled();
});
