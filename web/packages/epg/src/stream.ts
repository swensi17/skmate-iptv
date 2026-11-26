import { Gunzip } from "fflate";
import { breathe } from "./yielder";

const UNPACK_STEP = 16 * 1024;

/**
 * Reads a guide response chunk by chunk into [onText]; gzip (the usual `.xml.gz`) is unpacked on the fly,
 * so neither the packed nor the unpacked file is ever held whole. Between chunks it lets the screen breathe:
 * a TV that decodes a 20 MB guide must still answer the remote.
 */
export async function readGuide(res: Response, onText: (text: string) => void | Promise<void>): Promise<void> {
  const decoder = new TextDecoder("utf-8");
  let gz: Gunzip | null = null;
  let pending: Promise<void> | void = undefined;
  // Pieces are handed on strictly in order, also when one push unpacks into several.
  const emit = (text: string) => { if (text !== "") pending = pending ? pending.then(() => onText(text)) : onText(text); };

  const body = res.body;
  if (!body) {
    // No streaming (an old engine): the whole body at once, still unpacked if it is gzip.
    const bytes = new Uint8Array(await res.arrayBuffer());
    const g = new Gunzip((chunk) => emit(decoder.decode(chunk, { stream: true })));
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) g.push(bytes, true); else emit(decoder.decode(bytes));
    await pending;
    return;
  }

  const reader = body.getReader();
  let first = true;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (first) {
      first = false;
      if (value[0] === 0x1f && value[1] === 0x8b) {
        gz = new Gunzip((chunk) => emit(decoder.decode(chunk, { stream: true })));
      }
    }
    // A network piece of a packed guide unpacks to ten times its size: it is unpacked a quarter at a time.
    for (let i = 0; i < value.length; i += UNPACK_STEP) {
      const part = value.length <= UNPACK_STEP ? value : value.subarray(i, i + UNPACK_STEP);
      if (gz) gz.push(part, false); else emit(decoder.decode(part, { stream: true }));
      await pending;
      pending = undefined;
      await breathe();
    }
  }
  if (gz) gz.push(new Uint8Array(0), true);
  emit(decoder.decode());
  await pending;
}
