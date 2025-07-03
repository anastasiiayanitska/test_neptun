pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let selectedFiles = [];
let extractedData = [];

const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("fileInput");

uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});

uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragover");
});

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
  const files = Array.from(e.dataTransfer.files).filter(
    (file) => file.type === "application/pdf"
  );
  handleFiles(files);
});

fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  handleFiles(files);
});

function handleFiles(files) {
  files.forEach((file) => {
    if (!selectedFiles.find((f) => f.name === file.name)) {
      selectedFiles.push(file);
    }
  });
  updateFileList();
  updateButtons();
}

function updateFileList() {
  const fileList = document.getElementById("fileList");
  fileList.innerHTML = "";

  selectedFiles.forEach((file, index) => {
    const fileItem = document.createElement("div");
    fileItem.className = "file-item";
    fileItem.innerHTML = `
                    <div class="file-info">
                        <div>${file.name}</div>
                        <div class="file-size">${formatFileSize(
                          file.size
                        )}</div>
                    </div>
                    <button class="remove-btn" onclick="removeFile(${index})">Löschen</button>
                `;
    fileList.appendChild(fileItem);
  });
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  updateFileList();
  updateButtons();
}

function clearFiles() {
  selectedFiles = [];
  extractedData = [];
  updateFileList();
  updateButtons();
  document.getElementById("results").style.display = "none";
}

function updateButtons() {
  const processBtn = document.getElementById("processBtn");
  const clearBtn = document.getElementById("clearBtn");
  const hasFiles = selectedFiles.length > 0;

  processBtn.disabled = !hasFiles;
  clearBtn.disabled = !hasFiles;
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

async function processFiles() {
  const processing = document.getElementById("processing");
  const results = document.getElementById("results");
  const resultsList = document.getElementById("resultsList");

  processing.style.display = "block";
  results.style.display = "none";
  extractedData = [];

  try {
    for (const file of selectedFiles) {
      const data = await extractDataFromPDF(file);
      extractedData.push({
        fileName: file.name,
        ...data,
      });
    }

    displayResults();
    results.style.display = "block";
  } catch (error) {
    console.error("Fehler bei der Dateiverarbeitung:", error);
    alert("Beim Verarbeiten der Dateien ist ein Fehler aufgetreten");
  } finally {
    processing.style.display = "none";
  }
}

async function extractDataFromPDF(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      fullText += pageText + " ";
    }

    const invoiceNumber = extractInvoiceNumber(fullText);
    const amount = extractAmount(fullText);
    const vat = extractVAT(fullText);
    const reference = extractReference(fullText);

    return {
      success: true,
      invoiceNumber,
      amount,
      vat,
      reference,
      fullText,
    };
  } catch (error) {
    console.error("Fehler beim Extrahieren der Daten:", error);
    return {
      success: false,
      error: error.message,
      invoiceNumber: null,
      amount: null,
      vat: null,
      reference: null,
    };
  }
}

function extractInvoiceNumber(text) {
  const patterns = [
    /Invoice\s*(?:Number|No\.?)?\s*:?\s*(\d+)/i,
    /Rechnungs?-?Nr\.?\s*:?\s*(\d+)/i,
    /Sales\s*Invoice\s*(\d+)/i,
    /№\s*(\d+)/i,
    /\b(\d{6})\b/g,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function extractAmount(text) {
  const patterns = [
    /TOTAL\s*([\d,]+\.?\d*)/i,
    /Goods\s*([\d,]+\.?\d*)/i,
    /(?:Gesamtbetrag|Total|Amount)\s*(?:in\s*EUR)?\s*:?\s*([\d,]+\.?\d*)/i,

    /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*EUR/i,
    /EUR\s*([\d,]+\.?\d*)/i,

    /([\d,]+\.?\d*)\s*€/i,

    /(\d+[,.]?\d*)\s*(?=\s*$)/m,

    /Amount\s*VAT[^0-9]*([\d,]+\.?\d*)/i,

    /(\d{1,3}(?:,\d{3})*\.\d{2})\s*0\.00/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let amount = match[1].replace(/,/g, "");

      const numAmount = parseFloat(amount);
      if (numAmount > 0) {
        return amount;
      }
    }
  }
  return null;
}
function extractVAT(text) {
  const patterns = [
    /VAT\s*(?:Amount|Rate)?\s*:?\s*([\d,]+\.?\d*)/i,
    /MWST\s*:?\s*([\d,]+\.?\d*)/i,
    /USt\s*:?\s*([\d,]+\.?\d*)/i,

    /(\d+(?:[,.]\d{2})?)\s*%/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  if (
    text.includes("Reverse Charge") ||
    text.includes("VAT - Reverse Charge")
  ) {
    return "0.00 (Reverse Charge)";
  }

  return null;
}

function extractReference(text) {
  const patterns = [
    /(?:Referenz|Reference|Ref\.?)\s*:?\s*(\d+)/i,
    /(?:Customer\s*Ref|Kunden-?Nr\.?)\s*:?\s*(\d+)/i,
    /(?:Job\s*Number)\s*:?\s*(\d+)/i,
    /\b(15063587|20017433|15064911)\b/i,
    /\b(\d{8})\b/g,
    /(?:Internal\s+Invoice)\s+(\d+)/i,
    /(?:ACI)\s+(\d+)/i,
    /(?:ACL)(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function displayResults() {
  const resultsList = document.getElementById("resultsList");
  resultsList.innerHTML = "";

  extractedData.forEach((data) => {
    const resultCard = document.createElement("div");
    resultCard.className = "result-card";

    const status = data.success ? "success" : "error";
    const statusText = data.success ? "Verarbeitet" : "Felher";

    resultCard.innerHTML = `
                    <div class="result-header">
                        <div class="file-name">${data.fileName}</div>
                        <div class="status ${status}">${statusText}</div>
                    </div>
                    ${
                      data.success
                        ? `
                        <div class="data-grid">
                            <div class="data-item">
                                <div class="data-label">Rechnungsnummer</div>
                                <div class="data-value">${
                                  data.invoiceNumber || "Nicht gefunden"
                                }</div>
                            </div>
                            <div class="data-item">
                                <div class="data-label">Rechnungsbetrag
</div>
                                <div class="data-value">${
                                  data.amount || "Nicht gefunden"
                                }</div>
                            </div>
                            <div class="data-item">
                                <div class="data-label">MwSt</div>
                                <div class="data-value">${
                                  data.vat || "Nicht gefunden"
                                }</div>
                            </div>
                            <div class="data-item">
                                <div class="data-label">Referenz </div>
                                <div class="data-value">${
                                  data.reference || "Nicht gefunden"
                                }</div>
                            </div>
                        </div>
                    `
                        : `
                        <div class="error-message">
                            ${data.error}
                        </div>
                    `
                    }
                `;

    resultsList.appendChild(resultCard);
  });
}
