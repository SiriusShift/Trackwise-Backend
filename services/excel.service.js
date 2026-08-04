import ExcelJS from "exceljs";

/**
 * Converts rows of data into an .xlsx buffer.
 *
 * @param {Object} options
 * @param {string} options.sheetName - Name of the worksheet
 * @param {Array<{header: string, key: string, width?: number, numFmt?: string}>} options.columns
 * @param {Array<Object>} options.rows - Data rows, keyed to match `columns[].key`
 * @param {Array<{label: string, value: string|number}>} [options.summary] - Optional key-value rows added above the table (e.g. Opening Balance, Closing Balance)
 * @returns {Promise<Buffer>}
 */

export const generateExcelBuffer = async ({ sheetName = "Sheet1", columns, rows, summary }) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);

    // 1. Summary rows (label/value pairs, no header, no column formatting)
    if (summary?.length) {
        summary.forEach((item) => {
            const row = sheet.addRow([item.label, item.value]);
            row.font = { bold: true };
        });
        sheet.addRow([]); // spacer
    }

    // 2. Table header row — written explicitly, never via sheet.columns
    const headerRow = sheet.addRow(columns.map((c) => c.header));
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
        cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE5E7EB" },
        };
    });

    // 3. Data rows — use column keys manually since sheet.columns is never assigned
    rows.forEach((rowData) => {
        const rowValues = columns.map((col) => rowData[col.key] ?? "");
        const row = sheet.addRow(rowValues);

        // apply per-column numFmt where specified
        columns.forEach((col, i) => {
            if (col.numFmt) {
                row.getCell(i + 1).numFmt = col.numFmt;
            }
        });
    });

    // 4. Column widths — set directly, no header side effect
    columns.forEach((col, i) => {
        sheet.getColumn(i + 1).width = col.width ?? Math.max(col.header.length, 14);
    });

    return workbook.xlsx.writeBuffer();
};