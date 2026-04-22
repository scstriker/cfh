function cleanText(input: string) {
  return input.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

export async function extractTextFromPdfBuffer(arrayBuffer: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = (
    pdfjs as unknown as {
      getDocument: (params: unknown) => { promise: Promise<any> };
    }
  ).getDocument({
    data: new Uint8Array(arrayBuffer),
    disableWorker: true
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: { str?: string }) => {
        const text = "str" in item ? item.str ?? "" : "";
        return cleanText(text);
      })
      .filter(Boolean)
      .join(" ");
    if (pageText) {
      pages.push(pageText);
    }
  }

  await pdf.destroy();
  return pages.join("\n\n");
}
