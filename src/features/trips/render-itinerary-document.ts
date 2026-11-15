import { dayColor } from "@/lib/day-color";
import type { ItineraryDocument } from "./itinerary-document";

const WIDTH = 1240;
const HEIGHT = 1754;
const MARGIN = 76;
const FONT = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
type Line = { text: string; size: number; bold?: boolean; color: string; gap?: number };
type Page = { lines: Line[] };

function canvas(width: number, height: number) {
  const element = document.createElement("canvas"); element.width = width; element.height = height;
  const ctx = element.getContext("2d");
  if (!ctx) throw new Error("이미지를 만들 수 없습니다. 다른 브라우저에서 다시 시도해 주세요.");
  return { element, ctx };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, size: number, bold = false) {
  ctx.font = `${bold ? 700 : 400} ${size}px ${FONT}`;
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const character of paragraph) {
      if (line && ctx.measureText(line + character).width > WIDTH - MARGIN * 2) { lines.push(line); line = ""; }
      line += character;
    }
    lines.push(line);
  }
  return lines;
}

function layout(doc: ItineraryDocument): Page[] {
  const { element, ctx } = canvas(1, 1);
  const pages: Page[] = [];
  let current: Page = { lines: [] }, height = 0;
  const limit = HEIGHT - 250;
  const flush = () => { if (current.lines.length) pages.push(current); current = { lines: [] }; height = 0; };
  const add = (text: string, size: number, color = "#25344a", bold = false, gap = 0) => {
    const lines = wrap(ctx, text, size, bold);
    for (let i = 0; i < lines.length; i++) {
      const space = size * 1.55 + (i === 0 ? gap : 0);
      if (height + space > limit) flush();
      current.lines.push({ text: lines[i], size, color, bold, gap: i === 0 ? gap : 0 }); height += space;
    }
  };
  add(doc.title, 44, "#16233b", true);
  add(doc.subtitle, 21, "#596579", false, 12);
  add(`${doc.scope} · 항공편은 각 공항 현지 시각, 그 외는 여행 현지 시각`, 20, "#596579", false, 6);
  for (const day of doc.days) {
    if (height > limit - 210) flush();
    add(day.label, 30, dayColor(day.colorIndex), true, 36);
    if (!day.rows.length) add("등록된 일정이 없습니다.", 23, "#596579", false, 14);
    day.rows.forEach((row, index) => {
      // 일정의 제목과 시각은 가능하면 같은 페이지에 둔다.
      const leadHeight = wrap(ctx, row.title, 26, true).length * 41 + wrap(ctx, row.time, 23).length * 36 + 28;
      if (height + leadHeight > limit && height > 0) { flush(); add(`${day.label} · 계속`, 25, dayColor(day.colorIndex), true); }
      add(`${index + 1}. ${row.title}`, 26, "#25344a", true, 24);
      add(row.time, 23, dayColor(day.colorIndex), false, 6);
      add(row.detail, 20, "#596579", false, 4);
      if (row.note) add(row.note, 20, "#596579", false, 8);
    });
  }
  flush(); element.width = 0; element.height = 0;
  return pages;
}

function render(page: Page, pageNumber: number, total: number) {
  const { element, ctx } = canvas(WIDTH, HEIGHT);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#16233b"; ctx.fillRect(MARGIN, 48, 52, 5);
  ctx.font = `700 17px ${FONT}`; ctx.fillText("TRIP PLANNER", MARGIN + 68, 57);
  let y = 112;
  ctx.textBaseline = "top";
  for (const line of page.lines) {
    y += line.gap ?? 0; ctx.font = `${line.bold ? 700 : 400} ${line.size}px ${FONT}`; ctx.fillStyle = line.color;
    ctx.fillText(line.text, MARGIN, y); y += line.size * 1.55;
  }
  ctx.fillStyle = "#dce2e9"; ctx.fillRect(MARGIN, HEIGHT - 90, WIDTH - MARGIN * 2, 1);
  ctx.fillStyle = "#596579"; ctx.font = `18px ${FONT}`;
  ctx.fillText("여행 일정표", MARGIN, HEIGHT - 64); ctx.textAlign = "right"; ctx.fillText(`${pageNumber} / ${total}`, WIDTH - MARGIN, HEIGHT - 64);
  return element;
}

function jpeg(element: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => element.toBlob((blob) => blob ? resolve(blob) : reject(new Error("이미지 저장에 실패했습니다. PDF로 다시 시도해 주세요.")), "image/jpeg", 0.92));
}

export async function renderItineraryDocument(doc: ItineraryDocument, format: "pdf" | "jpg"): Promise<Blob> {
  await document.fonts.ready;
  const pages = layout(doc);
  if (format === "pdf") {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    pdf.setProperties({ title: doc.title, subject: doc.scope, creator: "Trip Planner" });
    for (let index = 0; index < pages.length; index++) {
      const page = render(pages[index], index + 1, pages.length);
      if (index) pdf.addPage();
      pdf.addImage(page.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
      page.width = 0; page.height = 0;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return pdf.output("blob");
  }
  if (pages.length > 12) throw new Error("일정이 길어 한 장의 JPG로 저장하기 어렵습니다. PDF로 저장하거나 Day를 선택해 주세요.");
  const { element, ctx } = canvas(WIDTH, HEIGHT * pages.length);
  for (let index = 0; index < pages.length; index++) {
    const page = render(pages[index], index + 1, pages.length);
    ctx.drawImage(page, 0, index * HEIGHT); page.width = 0; page.height = 0;
  }
  try { return await jpeg(element); } finally { element.width = 0; element.height = 0; }
}
