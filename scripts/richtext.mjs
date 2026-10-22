// modules/admaps-browser/scripts/richtext.mjs
// A release's description, as the site renders it (site/assets/richtext.js, ported): editor HTML through a fixed
// allowlist of tags, or the old tiny markdown; a poll tag {poll:N} becomes the poll's place (site/assets/poll.js).
// Polls are drawn as the site draws them for a guest — the vote itself happens on admaps.cloud in the browser (the
// site does not take votes by a device token).

import { L, esc as escAll } from "./text.mjs";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ESC[c]);

// The whole vocabulary the page accepts; any other token is shown as text, a link loses its tag quietly.
const TAGS = new Set(["p", "br", "b", "strong", "i", "em", "h2", "h3", "ul", "ol", "li", "a"]);

function sanitizeHtml(html) {
  return String(html ?? "").replace(/<!--[\s\S]*?(?:-->|$)/g, "").replace(/<[^>]*>?/g, (tok) => {
    const m = /^<(\/?)([a-z0-9]+)((?:\s[^>]*)?)>$/i.exec(tok);
    if (!m) return escapeHtml(tok);
    const close = m[1] === "/";
    const name = m[2].toLowerCase();
    if (!TAGS.has(name)) return escapeHtml(tok);
    if (close) return `</${name}>`;
    if (name === "a") {
      const href = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[3] ?? "");
      let url = href ? (href[1] ?? href[2] ?? "") : "";
      if (!/^https?:\/\//i.test(url) && /^[\w-]+(\.[\w-]+)+([/?#]|$)/.test(url)) url = `https://${url}`;
      if (!/^https?:\/\//i.test(url)) return "";
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">`;
    }
    return `<${name}>`;
  });
}

const POLL_RE = "\\{\\s*poll\\s*:\\s*(\\d{1,9})\\s*\\}";
const pollBlock = (id) => `<div class="poll" data-poll="${id}" hidden></div>`;
const markupOrTag = () => new RegExp(`(<[^>]*>)|${POLL_RE}`, "gi");
const blank = (s) => !String(s).replace(/<[^>]*>|&nbsp;|\s/gi, "");
const trimBr = (s) => String(s).replace(/^(?:\s|&nbsp;|<br\s*\/?>)+|(?:\s|&nbsp;|<br\s*\/?>)+$/gi, "");

function placePolls(html, put) {
  let out = String(html ?? "");
  out = out.replace(/<p>([\s\S]*?)<\/p>/gi, (whole, inner) => {
    const blocks = [];
    const plain = inner.replace(markupOrTag(), (m, tag, id) => {
      if (tag) return m;
      blocks.push(put(id));
      return "\u0000";
    });
    if (!blocks.length) return whole;
    const paras = plain.split("\u0000").map(trimBr);
    if (blocks.every((b) => !b)) {
      const kept = paras.filter((t) => !blank(t));
      return kept.length ? `<p>${kept.join(" ")}</p>` : "";
    }
    let res = "";
    paras.forEach((t, i) => {
      if (!blank(t)) res += `<p>${t}</p>`;
      if (i < blocks.length) res += blocks[i];
    });
    return res;
  });
  out = out.replace(markupOrTag(), (m, tag, id) => (tag ? m : put(id)));
  return out
    .replace(/<blockquote>\s*(<div class="poll" data-poll="\d+" hidden><\/div>)\s*<\/blockquote>/gi, "$1")
    .replace(/<blockquote>(?:\s|&nbsp;|<br\s*\/?>)*<\/blockquote>/gi, "");
}

/** Poll tags → their places (hidden until the poll is fetched). */
export const pollBlocks = (html) => placePolls(html, (id) => pollBlock(Number(id)));

function inline(s) {
  let x = escapeHtml(s);
  x = x.replace(/\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]{1,300})\)/g,
    (_, text, url) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`);
  x = x.replace(/\*\*([^*\n]{1,300})\*\*/g, "<strong>$1</strong>");
  x = x.replace(/(^|[^*])\*([^*\n]{1,300})\*/g, "$1<em>$2</em>");
  return x;
}

/** Text as the operator typed it → safe HTML. */
export function renderRich(text) {
  const t = String(text ?? "").replace(/\r\n?/g, "\n").trim();
  if (!t) return "";
  if (/^</.test(t)) return sanitizeHtml(t);
  return t.split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) return "";
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`;
    }
    const head = lines.length === 1 && lines[0].match(/^\s*#{1,3}\s+(.*)$/);
    if (head) return `<h3>${inline(head[1])}</h3>`;
    return `<p>${lines.map(inline).join("<br>")}</p>`;
  }).join("");
}

/**
 * The polls under root, as a guest sees them on the site: the question and the options, and the way to vote — on
 * the page itself in the browser (voteUrl). A poll that is gone (404) leaves no trace; a busy server — an empty place.
 */
export async function mountPolls(root, base, voteUrl) {
  const boxes = [...root.querySelectorAll(".poll[data-poll]")];
  const ids = [...new Set(boxes.map((b) => b.dataset.poll))];
  await Promise.all(ids.map(async (id) => {
    const mine = boxes.filter((b) => b.dataset.poll === id);
    let r;
    try { r = await fetch(`${base}/api/polls/${encodeURIComponent(id)}`, { cache: "no-store" }); } catch (_e) { return; }
    if (r.status === 404) { for (const b of mine) b.remove(); return; }
    if (!r.ok) return;
    let poll;
    try { poll = await r.json(); } catch (_e) { return; }
    if (!Array.isArray(poll?.options)) return;
    for (const b of mine) paintPoll(b, poll, voteUrl);
  }));
}

let seq = 0;
function paintPoll(box, poll, voteUrl) {
  const n = ++seq;
  const type = poll.multi ? "checkbox" : "radio";
  const link = `<a href="${escAll(voteUrl)}" target="_blank" rel="noopener">${escAll(L("signIn"))}</a>`;
  box.innerHTML = `<form class="pollform" novalidate>
    <p class="pollq">${escAll(poll.question)}</p>
    <p class="pollhint">${escAll(poll.multi ? L("poll.multi") : L("poll.one"))}</p>
    <fieldset class="pollopts" disabled>
      ${poll.options.map((o) => `<label class="pollopt">
        <input type="${type}" name="poll-${Number(poll.id)}-${n}" value="${Number(o.id)}">
        <span>${escAll(o.text)}</span></label>`).join("")}
    </fieldset>
    <p class="pollsign">${L("poll.sign").split("{link}").map(escAll).join(link)}</p>
  </form>`;
  box.querySelector("form").addEventListener("submit", (e) => e.preventDefault());
  box.hidden = false;
}
