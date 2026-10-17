// 공유 카드 창: 카드 PNG 미리보기 → 저장(내려받기) · 공유(휴대폰 공유 시트, 지원할 때) · 링크 복사.
// 그리기는 /share-card.mjs(서버 /s/*.svg 와 같은 배치). 카드 숫자는 호출한 화면이 받은 API 응답 그대로.
(() => {
  let modP = null;
  const mod = () => (modP ||= import("/share-card.mjs?v=2"));
  const E = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let box = null;
  let blob = null;
  let url = null;
  let cur = null;
  function ensure() {
    if (box) return box;
    box = document.createElement("div");
    box.className = "ssh-back";
    box.hidden = true;
    box.innerHTML = `<div class="ssh" role="dialog" aria-modal="true" aria-labelledby="sshT"><div class="ssh-h"><b id="sshT">이날의 날씨 카드</b><button type="button" class="sec ssh-x" data-ssh="close" aria-label="닫기">×</button></div>
      <div class="ssh-img" id="sshImg"><div class="sx-state">카드 만드는 중…</div></div>
      <p class="ssh-note" id="sshNote"></p>
      <div class="ssh-acts"><button type="button" data-ssh="save">이미지 저장(PNG)</button><button type="button" class="sec" data-ssh="share" id="sshShare" hidden>공유하기</button><button type="button" class="sec" data-ssh="link">공유 링크 복사</button></div>
      <p class="ssh-msg" id="sshMsg" role="status"></p></div>`;
    document.body.appendChild(box);
    box.addEventListener("click", (e) => {
      if (e.target === box) return close();
      const b = e.target.closest("[data-ssh]");
      if (!b) return;
      const a = b.dataset.ssh;
      if (a === "close") close();
      else if (a === "save") save();
      else if (a === "share") share();
      else if (a === "link") copyLink();
    });
    addEventListener("keydown", (e) => { if (e.key === "Escape" && !box.hidden) close(); });
    return box;
  }
  const msg = (t) => { const m = document.getElementById("sshMsg"); if (m) m.textContent = t; };
  function close() { box.hidden = true; document.body.classList.remove("ssh-open"); if (url) URL.revokeObjectURL(url); url = null; blob = null; cur?.opener?.focus?.(); }
  // opts: { spec, filename, shareUrl, title, note }
  async function open(opts) {
    ensure();
    cur = { ...opts, opener: document.activeElement };
    box.hidden = false;
    document.body.classList.add("ssh-open");
    document.getElementById("sshT").textContent = opts.title || "이날의 날씨 카드";
    document.getElementById("sshNote").textContent = opts.note || "카드의 숫자는 화면과 같은 서버 계산 결과입니다. 출처·지점·기간·표본 수가 함께 들어갑니다.";
    document.getElementById("sshImg").innerHTML = `<div class="sx-state">카드 만드는 중…</div>`;
    msg("");
    box.querySelector("[data-ssh=save]").focus();
    try {
      const m = await mod();
      blob = await m.toPngBlob(opts.spec, 1);
      url = URL.createObjectURL(blob);
      document.getElementById("sshImg").innerHTML = `<img src="${url}" alt="${E(opts.spec.title)} 카드 미리보기" width="1080" height="1350">`;
      const file = new File([blob], `${m.safeName(opts.filename)}.png`, { type: "image/png" });
      cur.file = file;
      document.getElementById("sshShare").hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    } catch (e) { document.getElementById("sshImg").innerHTML = `<div class="sx-state err">카드를 만들지 못했습니다 · ${E(e.message)}</div>`; }
  }
  function save() {
    if (!blob || !cur?.file) return;
    const a = document.createElement("a");
    a.href = url; a.download = cur.file.name;
    document.body.appendChild(a); a.click(); a.remove();
    msg(`${cur.file.name} 저장을 시작했습니다`);
  }
  async function share() {
    if (!cur?.file) return;
    try { await navigator.share({ files: [cur.file], title: cur.spec.title, text: cur.shareUrl ? `${cur.spec.title} ${cur.shareUrl}` : cur.spec.title }); msg("공유했습니다"); }
    catch (e) { if (e?.name !== "AbortError") msg(`공유하지 못했습니다 · ${e.message}`); }
  }
  async function copyLink() {
    const link = cur?.shareUrl || location.href;
    try { await navigator.clipboard.writeText(link); msg("링크를 복사했습니다 — 메신저에 붙이면 숫자가 담긴 미리보기 문구가 나옵니다"); }
    catch { prompt("이 주소를 복사하세요", link); }
  }
  window.StoryShare = { open, close, module: mod };
})();
