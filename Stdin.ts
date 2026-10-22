import * as fs from "fs";

// Reads standard input one line at a time.
//
// The first version of `input()` called `fs.readSync` once and trimmed the result, so a
// program that asked twice received the whole pipe on the first call and an empty string on
// the second, a line longer than the 1 KiB buffer was silently cut in half, and spaces the
// user typed were thrown away. This class keeps the bytes that arrive after the first
// newline so that every call returns exactly one line, and reports end of input as null
// instead of as an empty line, so the interpreter can say so rather than pretend someone
// pressed Enter.
//
// Only the line terminator is removed: leading and trailing spaces belong to the line, and
// CRLF input yields the same text as LF input. Bytes are split at `\n` before they are
// decoded, so a multi-byte character is never cut in half.
const CHUNK_SIZE = 4096;
const NEWLINE = 0x0a;
const BYTE_ORDER_MARK = 0xfeff;

// Blocks for `ms` milliseconds. `fs.readSync` takes no timeout, and an Atomics wait is the
// only synchronous sleep available to the interpreter.
function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export class StdinLines {
  // Bytes that were read ahead but not handed out yet.
  private pending: Buffer = Buffer.alloc(0);
  private atEnd = false;
  private firstLine = true;

  // The next line without its terminator, or null once the input is exhausted. The last
  // line of a file that does not end in a newline is still returned, exactly once.
  public readLine(): string | null {
    for (;;) {
      const newline = this.pending.indexOf(NEWLINE);
      if (newline !== -1) {
        const line = this.pending.subarray(0, newline);
        this.pending = this.pending.subarray(newline + 1);
        return this.decode(line);
      }

      if (this.atEnd) {
        if (this.pending.length === 0) return null;
        const line = this.pending;
        this.pending = Buffer.alloc(0);
        return this.decode(line);
      }

      this.readChunk();
    }
  }

  // Appends whatever stdin has available. Reading in chunks (rather than one byte at a
  // time) keeps long lines cheap; `readLine` takes care of the bytes past the newline.
  private readChunk(): void {
    const chunk = Buffer.alloc(CHUNK_SIZE);

    for (;;) {
      let read = 0;
      try {
        read = fs.readSync(0, chunk, 0, CHUNK_SIZE, null);
      } catch (error: any) {
        // A non-blocking stdin says "nothing ready yet" instead of blocking.
        if (error?.code === "EAGAIN" || error?.code === "EWOULDBLOCK") {
          sleep(5);
          continue;
        }
        // Some platforms report end of input as an error, and a closed descriptor is the
        // same thing from the program's point of view.
        if (error?.code === "EOF" || error?.code === "EBADF") {
          this.atEnd = true;
          return;
        }
        throw error;
      }

      if (read === 0) {
        this.atEnd = true;
        return;
      }

      this.pending = Buffer.concat([this.pending, chunk.subarray(0, read)]);
      return;
    }
  }

  private decode(line: Buffer): string {
    const text = line.toString("utf8").replace(/\r$/, "");
    if (!this.firstLine) return text;

    this.firstLine = false;
    // A byte order mark at the very start of the input is not part of the first line.
    return text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text;
  }
}
