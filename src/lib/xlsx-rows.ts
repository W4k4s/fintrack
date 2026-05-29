import * as XLSX from "xlsx";

/** xlsx files start with the ZIP local-file-header magic bytes `PK\x03\x04`. */
export function isXlsxBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

/**
 * Read the first worksheet of an xlsx/xls buffer into `string[][]` (row 0 =
 * header). Every cell is coerced to a trimmed string.
 *
 * MEXC quirk: its exports declare a misleading `<dimension ref="A2:…"/>` that
 * starts at row 2, so the header row (row 1) is *present in the XML* but falls
 * outside `!ref` and `sheet_to_json` drops it. We force the read range to start
 * at A1 to recover the header — harmless for well-formed files whose range
 * already begins at A1.
 */
export function parseXlsxRows(buf: Buffer): string[][] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!ws || !ws["!ref"]) return [];

  const range = XLSX.utils.decode_range(ws["!ref"]);
  range.s.r = 0;
  range.s.c = 0;

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    blankrows: false,
    range,
  });

  return rows.map(row => row.map(cell => (cell == null ? "" : String(cell).trim())));
}
