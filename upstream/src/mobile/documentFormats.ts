import { zipSync, strToU8 } from 'fflate'
export type DocumentFormat = 'docx' | 'xlsx' | 'pdf'
export const MIMES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
}
const xml = (text: string) =>
  text
    .split('')
    .filter((c) => c.charCodeAt(0) >= 32 || '\t\n\r'.includes(c))
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const pack = (files: Record<string, string>) =>
  zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, strToU8(declaration + text)])
    )
  )
export const plainText = (s: string) =>
  s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
export function safeDocumentName(title: string, format: DocumentFormat) {
  const name =
    title
      .split('')
      .filter((c) => c.charCodeAt(0) >= 32)
      .join('')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/^\.+/, '')
      .trim()
      .replace(/\.(docx|xlsx|pdf)$/i, '')
      .slice(0, 100) || '未命名文档'
  return name + '.' + format
}
function word(title: string, text: string): Uint8Array {
  const paragraph = (t: string, style = '') =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${xml(plainText(t))}</w:t></w:r></w:p>`
  const body = text
    .split(/\r?\n/)
    .map((line) => {
      const heading = /^(#{1,3})\s+(.+)$/.exec(line)
      return heading
        ? paragraph(heading[2], 'Heading' + heading[1].length)
        : paragraph(line.replace(/^[-*]\s+/, '• '))
    })
    .join('')
  return pack({
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'word/styles.xml':
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="等线"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>' +
      [1, 2, 3]
        .map(
          (i) =>
            `<w:style w:type="paragraph" w:styleId="Heading${i}"><w:name w:val="heading ${i}"/><w:pPr><w:keepNext/><w:outlineLvl w:val="${i - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${34 - i * 4}"/></w:rPr></w:style>`
        )
        .join('') +
      '</w:styles>',
    'word/document.xml': `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph(title, 'Title')}${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`,
  })
}
function checkedRows(rows: string[][]): string[][] {
  if (
    rows.length > 10000 ||
    rows.reduce((n, r) => n + r.length, 0) > 100000 ||
    rows.some((r) => r.length > 200)
  ) {
    throw new Error('表格超出大小限制（最多 10000 行、100000 个单元格、200 列）')
  }
  return rows.length ? rows : [['']]
}
export function tableRows(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length > 10000) {
    throw new Error('表格最多支持 10000 行')
  }
  if (
    lines.some((line) => line.includes('|')) &&
    lines.slice(0, 4).some((line) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line))
  ) {
    return checkedRows(
      lines
        .filter((line) => !/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line))
        .map((line) =>
          line
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((s) => s.trim())
        )
    )
  }
  const delimiter = lines[0]?.includes('\t') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (quoted || !field) {
        quoted = !quoted
      } else {
        field += c
      }
    } else if (c === delimiter && !quoted) {
      row.push(field)
      field = ''
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') {
        i++
      }
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  if (quoted) {
    throw new Error('CSV 引号未闭合')
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  if (rows.reduce((n, r) => n + r.length, 0) > 100000 || rows.some((r) => r.length > 200)) {
    throw new Error('表格超出大小限制（最多 100000 个单元格、200 列）')
  }
  return checkedRows(rows)
}
function column(n: number): string {
  let out = ''
  for (n++; n > 0; n = Math.floor((n - 1) / 26)) {
    out = String.fromCharCode(65 + ((n - 1) % 26)) + out
  }
  return out
}
function sheet(title: string, text: string): Uint8Array {
  const rows = tableRows(text)
  const count = Math.max(...rows.map((r) => r.length))
  const sheetName = title.replace(/[\\/*?:[\]]/g, '').slice(0, 31) || 'Sheet1'
  const data = rows
    .map(
      (row, i) =>
        `<row r="${i + 1}">${row
          .map((cell, j) => {
            const r = column(j) + (i + 1)
            return /^-?(0|[1-9]\d*)(\.\d+)?$/.test(cell) && cell.length < 16
              ? `<c r="${r}" s="${i === 0 ? 1 : 0}"><v>${xml(cell)}</v></c>`
              : `<c r="${r}" s="${i === 0 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`
          })
          .join('')}</row>`
    )
    .join('')
  return pack({
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml':
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${column(count - 1)}${rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${Array.from({ length: count }, (_, j) => `<col min="${j + 1}" max="${j + 1}" width="${Math.max(12, Math.min(40, ...rows.slice(0, 500).map((r) => (r[j] || '').length * 1.6 + 3)))}" customWidth="1"/>`).join('')}</cols><sheetData>${data}</sheetData><autoFilter ref="A1:${column(count - 1)}${rows.length}"/></worksheet>`,
  })
}
async function pdf(title: string, text: string, fontBytes?: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib')
  const fontkit = await import('@pdf-lib/fontkit')
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit.default)
  const bytes =
    fontBytes ||
    new Uint8Array(
      await (await fetch(new URL('document-font.otf', document.baseURI))).arrayBuffer()
    )
  const font = await doc.embedFont(bytes, { subset: true })
  const supported = new Set(font.getCharacterSet())
  const clean = (s: string) =>
    Array.from(s)
      .map((c) => (supported.has(c.codePointAt(0) || 0) ? c : '□'))
      .join('')
  let page = doc.addPage([595.28, 841.89])
  let y = 790
  const draw = (value: string, size: number) => {
    let line = ''
    const max = 491
    const flush = () => {
      if (y < 65) {
        page = doc.addPage([595.28, 841.89])
        y = 790
      }
      page.drawText(line, { x: 52, y, size, font, color: rgb(0.12, 0.15, 0.2) })
      y -= size * 1.65
      line = ''
    }
    for (const char of Array.from(clean(value))) {
      if (font.widthOfTextAtSize(line + char, size) > max && line) {
        flush()
      }
      line += char
    }
    flush()
  }
  draw(title, 21)
  y -= 12
  for (const raw of text.split(/\r?\n/)) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(raw)
    draw(plainText(heading ? heading[2] : raw), heading ? 17 - heading[1].length : 11)
  }
  doc.setTitle(title)
  doc.setProducer('ds mobile document tools')
  return doc.save()
}
export async function createDocument(
  format: DocumentFormat,
  title: string,
  text: string,
  fontBytes?: Uint8Array
): Promise<Blob> {
  if (!text.trim()) {
    throw new Error('请先填写文档内容，或使用模型生成。')
  }
  if (text.length > 200000) {
    throw new Error('单份文档最多支持 200000 个字符。')
  }
  const bytes =
    format === 'docx'
      ? word(title, text)
      : format === 'xlsx'
        ? sheet(title, text)
        : await pdf(title, text, fontBytes)
  return new Blob([Uint8Array.from(bytes).buffer], { type: MIMES[format] })
}
