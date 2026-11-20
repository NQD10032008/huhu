const FIXES_KEY = "OCR_CUSTOM_FIXES_V1";

const DEFAULT_FIXES = [
  ["hoá đơn", "hóa đơn"],
  ["tổng công", "tổng cộng"],
  ["thành tiên", "thành tiền"],
  ["thanh toan", "thanh toán"],
  ["sô lượng", "số lượng"],
  ["đơn giá", "đơn giá"],
  ["nhân dang", "nhận dạng"],
  ["văn bản", "văn bản"],
  ["hinh ảnh", "hình ảnh"],
  ["xử lí", "xử lý"],
  ["chủ đồ", "chủ đề"],
  ["ké hoạch", "kế hoạch"],
  ["kĩ năng", "kỹ năng"],
  ["tiên mặt", "tiền mặt"],
  ["chuyên khoản", "chuyển khoản"],
  ["thuê vat", "thuế VAT"],
  ["mã sô thuê", "mã số thuế"],
];

function loadFixes() {
  try {
    const raw = localStorage.getItem(FIXES_KEY);
    if (!raw) return new Map(DEFAULT_FIXES);
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Map(arr) : new Map(DEFAULT_FIXES);
  } catch {
    return new Map(DEFAULT_FIXES);
  }
}

function saveFixes(mapObj) {
  try {
    localStorage.setItem(FIXES_KEY, JSON.stringify(Array.from(mapObj.entries())));
  } catch {}
}

const OCR_FIXES = loadFixes();

function prepareImage(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(file);
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          URL.revokeObjectURL(url);
          return resolve(file);
        }

        const minEdge = Math.min(w, h);
        const scale = minEdge < 900 ? Math.min(2, 1200 / minEdge) : 1;

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          return resolve(file);
        }

        ctx.filter = "grayscale(100%) contrast(125%) brightness(105%)";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          resolve(blob || file);
        }, "image/png", 0.92);
      } catch {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

function isNoiseLine(line) {
  if (!line) return true;
  if (/^[=<>~^¬|+\\\-_.*•·°„“”¿¡\[\]{}|/\\]+$/.test(line)) return true;
  if (/^\d{1,2}:\d{2,3}(\s*[.,:-]*.*)?$/.test(line)) return true;
  if (/^=\s*Gemini\b/i.test(line)) return true;
  if (/^(trang|page)\s*\d+/i.test(line)) return true;

  const cleanLetters = line.replace(/[^a-zA-Z0-9À-ỹ]/g, "");
  if (cleanLetters.length < 2) return true;

  const words = line.split(" ");
  if (words.length >= 3 && words.every((w) => w.length <= 2)) return true;

  return false;
}

function cleanLineChars(line) {
  let s = line.normalize("NFC").replace(/\s+/g, " ").trim();
  s = s.replace(/[¬^~`¿¡„“”|+*=<>]+/g, " ");
  s = s.replace(/^[\[\]|.,:;!?-]+|[\[\]|+*~^=<>]+$/g, "").trim();
  s = s.replace(/\s+([,.;:!?])/g, "$1");
  s = s.replace(/([,.;:!?])(?:\s*[.,:;!?])+/g, "$1");
  s = s.replace(/([,.;:!?])(?=[^\s\d"”’)\]])/g, "$1 ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function fixWordsAndInvoice(text, isInvoiceMode) {
  let out = text;

  const glueList = [
    ["tênvitrí", "tên vị trí"],
    ["vịtrí", "vị trí"],
    ["chếđộ", "chế độ"],
    ["tấtcả", "tất cả"],
    ["kếtquả", "kết quả"],
    ["khớpchínhxác", "khớp chính xác"],
    ["hìnhảnh", "hình ảnh"],
    ["nhậndạng", "nhận dạng"],
    ["vănbản", "văn bản"],
    ["thựchiện", "thực hiện"],
    ["nhiệmvụ", "nhiệm vụ"],
    ["tìnhhuống", "tình huống"],
    ["trảinghiệm", "trải nghiệm"],
    ["hóađơn", "hóa đơn"],
    ["hoáđơn", "hóa đơn"],
    ["tổngcộng", "tổng cộng"],
    ["thànhtiền", "thành tiền"],
    ["sốlượng", "số lượng"],
    ["đơngiá", "đơn giá"],
  ];

  for (const [wrong, right] of glueList) {
    out = out.split(wrong).join(right);
    const capWrong = wrong.charAt(0).toUpperCase() + wrong.slice(1);
    const capRight = right.charAt(0).toUpperCase() + right.slice(1);
    out = out.split(capWrong).join(capRight);
  }

  OCR_FIXES.forEach((rightVal, wrongKey) => {
    const tokens = out.split(" ").map((tok) => {
      const bare = tok.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (bare.toLowerCase() === wrongKey) {
        const isCap = /^[A-ZÀ-Ỹ]/.test(bare);
        const fixedBare = isCap
          ? rightVal.charAt(0).toUpperCase() + rightVal.slice(1)
          : rightVal;
        return tok.replace(bare, fixedBare);
      }
      return tok;
    });
    out = tokens.join(" ");
  });

  if (isInvoiceMode || /(hóa đơn|tổng cộng|thành tiền|số lượng|đơn giá|vat)/i.test(out)) {
    out = out
      .replace(/(\d[\d.,]*)\s*(vnd|vnđ|đồng)\b/gi, "$1 VNĐ")
      .replace(/(\d[\d.,]*)\s*d(?=\s|$|[.,;:])/g, "$1đ");
  }

  return out.trim();
}

function joinCrossPageLines(lines) {
  const result = [];
  for (const line of lines) {
    if (!line) continue;
    if (!result.length) {
      result.push(line);
      continue;
    }
    const prev = result[result.length - 1];
    const endsSentence = /[.!?:;]$/.test(prev);
    const startsNewBlock =
      /^(\[|Tiêu đề:|Kính gửi|Tổng cộng|Thành tiền|Tiền mặt|Chuyển khoản|Thuế VAT|Mã số thuế|\d+[.)]\s)/i.test(
        line
      );

    if (!endsSentence && !startsNewBlock) {
      result[result.length - 1] = `${prev} ${line}`.replace(/\s+/g, " ").trim();
    } else {
      result.push(line);
    }
  }
  return result;
}

function processOcrOutput(rawText, isInvoiceMode) {
  if (!rawText) return "";
  const lines = rawText
    .split(/\r?\n/)
    .map(cleanLineChars)
    .filter((line) => line && !isNoiseLine(line))
    .map((line) => fixWordsAndInvoice(line, isInvoiceMode));

  return joinCrossPageLines(lines).join("\n").trim();
}

document.addEventListener("DOMContentLoaded", () => {
  const selectImageBtn = document.getElementById("selectImageBtn");
  const imageInput = document.getElementById("imageInput");
  const dropZone = document.getElementById("dropZone");
  const recognizeBtn = document.getElementById("recognizeBtn");
  const resultText = document.getElementById("resultText");
  const activeCategoryBadge = document.getElementById("activeCategoryBadge");
  const messageBox = document.getElementById("messageBox");
  const progressWrapper = document.getElementById("progressWrapper");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const copyBtn = document.getElementById("copyBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const docTypeSelect =
    document.getElementById("docTypeSelect") ||
    document.getElementById("categorySelect");

  const cameraBtn =
    document.getElementById("cameraBtn") ||
    document.getElementById("captureBtn") ||
    Array.from(document.querySelectorAll("button")).find((b) =>
      /chụp ảnh trực tiếp/i.test(b.textContent || "")
    );

  let filesList = [];
  let lastSnapshot = "";
  let stream = null;
  let modal = null;
  let facing = "environment";

  function showMsg(text, isErr = false) {
    if (!messageBox) return;
    messageBox.textContent = text;
    messageBox.classList.remove("hidden");
    messageBox.style.color = isErr ? "#b91c1c" : "";
  }

  function setFiles(incoming) {
    filesList = Array.from(incoming || []).filter(
      (f) => f && f.type && f.type.startsWith("image/")
    );
    if (filesList.length) {
      if (recognizeBtn) recognizeBtn.disabled = false;
      showMsg(`Đã chọn ${filesList.length} ảnh: ${filesList.map((f) => f.name).join(", ")}`);
    } else {
      if (recognizeBtn) recognizeBtn.disabled = true;
      showMsg("Vui lòng chọn ảnh hợp lệ (JPG, PNG, WEBP...).", true);
    }
  }

  if (selectImageBtn && imageInput) {
    selectImageBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      imageInput.value = "";
      imageInput.click();
    });
  }

  if (imageInput) {
    imageInput.addEventListener("change", (e) => setFiles(e.target.files));
  }

  if (dropZone) {
    dropZone.addEventListener("dragover", (e) => e.preventDefault());
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files) {
        setFiles(e.dataTransfer.files);
      }
    });
  }

  const fallbackCamInput = document.createElement("input");
  fallbackCamInput.type = "file";
  fallbackCamInput.accept = "image/*";
  fallbackCamInput.setAttribute("capture", "environment");
  fallbackCamInput.classList.add("hidden");
  document.body.appendChild(fallbackCamInput);
  fallbackCamInput.addEventListener("change", (e) => setFiles(e.target.files));

  function closeCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (modal) {
      modal.remove();
      modal = null;
    }
  }

  async function startCamera(videoEl) {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing } },
      audio: false,
    });
    videoEl.srcObject = stream;
  }

  async function openCamera() {
    closeCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      fallbackCamInput.value = "";
      fallbackCamInput.click();
      return;
    }

    try {
      modal = document.createElement("div");
      modal.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,0.78);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;padding:16px;gap:12px;";

      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.style.cssText = "max-width:100%;max-height:70vh;border-radius:10px;background:#000;";

      await startCamera(video);

      const bar = document.createElement("div");
      bar.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;justify-content:center;";

      const snap = document.createElement("button");
      snap.type = "button";
      snap.textContent = "Chụp ảnh";
      snap.style.cssText =
        "padding:10px 18px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;";

      const flip = document.createElement("button");
      flip.type = "button";
      flip.textContent = "Đổi camera";
      flip.style.cssText =
        "padding:10px 18px;border:none;border-radius:8px;background:#475569;color:#fff;font-weight:600;cursor:pointer;";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Đóng";
      cancel.style.cssText =
        "padding:10px 18px;border:none;border-radius:8px;background:#dc2626;color:#fff;font-weight:600;cursor:pointer;";

      snap.addEventListener("click", () => {
        const cvs = document.createElement("canvas");
        cvs.width = video.videoWidth || 1280;
        cvs.height = video.videoHeight || 720;
        const c = cvs.getContext("2d");
        if (c) {
          c.drawImage(video, 0, 0, cvs.width, cvs.height);
          cvs.toBlob((blob) => {
            if (blob) {
              setFiles([new File([blob], `cam-${Date.now()}.jpg`, { type: "image/jpeg" })]);
            }
            closeCamera();
          }, "image/jpeg", 0.92);
        } else {
          closeCamera();
        }
      });

      flip.addEventListener("click", async () => {
        facing = facing === "environment" ? "user" : "environment";
        try {
          await startCamera(video);
        } catch {}
      });

      cancel.addEventListener("click", closeCamera);

      bar.appendChild(snap);
      bar.appendChild(flip);
      bar.appendChild(cancel);
      modal.appendChild(video);
      modal.appendChild(bar);
      document.body.appendChild(modal);
    } catch {
      closeCamera();
      fallbackCamInput.value = "";
      fallbackCamInput.click();
    }
  }

  if (cameraBtn) {
    cameraBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openCamera();
    });
  }

  function learnEdits(prevText, nextText) {
    if (!prevText || !nextText || prevText === nextText) return;
    const a = prevText.trim().split(/\s+/);
    const b = nextText.trim().split(/\s+/);
    if (a.length !== b.length) return;

    let changed = 0;
    for (let i = 0; i < a.length; i++) {
      const w1 = a[i].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();
      const w2 = b[i].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (w1.length >= 2 && w2.length >= 2 && w1 !== w2.toLowerCase()) {
        OCR_FIXES.set(w1, w2);
        changed++;
      }
    }
    if (changed > 0) saveFixes(OCR_FIXES);
  }

  if (resultText) {
    resultText.addEventListener("blur", () => {
      learnEdits(lastSnapshot, resultText.value);
      lastSnapshot = resultText.value;
    });
  }

  if (copyBtn && resultText) {
    copyBtn.addEventListener("click", async () => {
      learnEdits(lastSnapshot, resultText.value);
      lastSnapshot = resultText.value;
      try {
        await navigator.clipboard.writeText(resultText.value);
        showMsg("Đã sao chép kết quả.");
      } catch {
        showMsg("Hãy bôi đen và nhấn Ctrl+C để sao chép.", true);
      }
    });
  }

  if (downloadBtn && resultText) {
    downloadBtn.addEventListener("click", () => {
      learnEdits(lastSnapshot, resultText.value);
      lastSnapshot = resultText.value;
      const blob = new Blob([resultText.value], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ket-qua-ocr.txt";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filesList = [];
      lastSnapshot = "";
      if (imageInput) imageInput.value = "";
      if (resultText) resultText.value = "";
      if (recognizeBtn) recognizeBtn.disabled = true;
      if (progressWrapper) progressWrapper.classList.add("hidden");
      if (progressBar) progressBar.style.width = "0%";
      if (activeCategoryBadge) activeCategoryBadge.classList.add("hidden");
      showMsg("Đã xóa làm lại.");
    });
  }

  if (recognizeBtn) {
    recognizeBtn.addEventListener("click", async () => {
      if (!filesList.length) {
        showMsg("Vui lòng chọn ít nhất 1 ảnh trước.", true);
        return;
      }
      if (typeof Tesseract === "undefined" || !Tesseract.createWorker) {
        showMsg("Chưa tải được Tesseract.js, hãy kiểm tra mạng và tải lại trang.", true);
        return;
      }

      const langInput = document.getElementById("customLangInput");
      const lang = (langInput && langInput.value ? langInput.value : "vie").trim() || "vie";
      const modeVal = (docTypeSelect && docTypeSelect.value ? docTypeSelect.value : "").toLowerCase();
      const isInvoiceMode = modeVal.includes("invoice") || modeVal.includes("hoa") || modeVal.includes("hóa");

      let worker = null;
      try {
        recognizeBtn.disabled = true;
        if (progressWrapper) progressWrapper.classList.remove("hidden");
        if (progressBar) progressBar.style.width = "5%";
        if (progressText) progressText.textContent = "Đang khởi tạo... 5%";

        worker