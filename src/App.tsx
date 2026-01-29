import { useState, useEffect, useCallback } from 'react';
import {
  FileUp, X, CheckCircle2, Download, Zap,
  ImageIcon, Loader2, Sun, Moon,
  FileText, ChevronRight, ShieldCheck, Globe, Cpu,
  HelpCircle, BookOpen, Lock
} from 'lucide-react';
import { jsPDF } from 'jspdf'
import { THAI_FONT_BASE64 } from './thaiFont';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [targetFormat, setTargetFormat] = useState('jpg');
  const [selectedSize, setSelectedSize] = useState('original');
  const [isDark, setIsDark] = useState(false);

  const [customW, setCustomW] = useState('5.0');
  const [customH, setCustomH] = useState('5.0');
  const [unit, setUnit] = useState('cm');

  // เช็คประเภทไฟล์
  const isWordFile = file?.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file?.name.toLowerCase().endsWith('.docx');
  const isExcelFile = file?.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file?.name.toLowerCase().endsWith('.xlsx');

  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDark]);

  useEffect(() => {
    if (isWordFile || isExcelFile) {
      setTargetFormat('pdf');
    }
  }, [isWordFile, isExcelFile]);

  const resetApp = useCallback(() => {
    if (downloadUrl && downloadUrl.startsWith('blob:')) {
      URL.revokeObjectURL(downloadUrl);
    }
    setFile(null);
    setIsDone(false);
    setDownloadUrl(null);
    setTargetFormat('jpg');
    setSelectedSize('original');
  }, [downloadUrl]);

  const renderHtmlToPdf = async (htmlContent: string, isTable = false) => {
    const doc = new jsPDF('p', 'pt', 'a4');

    if (THAI_FONT_BASE64 && THAI_FONT_BASE64.length > 100) {
      doc.addFileToVFS("Sarabun.ttf", THAI_FONT_BASE64);
      doc.addFont("Sarabun.ttf", "Sarabun", "normal");
      doc.setFont("Sarabun");
    }

    const container = document.createElement('div');
    container.style.width = isTable ? '800px' : '500px';
    container.style.padding = '40px';
    container.style.backgroundColor = '#ffffff';
    container.style.color = '#000000';
    container.style.fontFamily = 'Sarabun';
    container.style.fontSize = isTable ? '10pt' : '14pt';
    container.style.lineHeight = '1.6';
    container.innerHTML = htmlContent;

    if (isTable) {
      const tables = container.getElementsByTagName('table');
      for (let i = 0; i < tables.length; i++) {
        tables[i].style.borderCollapse = 'collapse';
        tables[i].style.width = '100%';
        const cells = tables[i].getElementsByTagName('td');
        for (let j = 0; j < cells.length; j++) {
          cells[j].style.border = '1px solid #ccc';
          cells[j].style.padding = '4px';
        }
      }
    }

    document.body.appendChild(container);

    await doc.html(container, {
      callback: function (doc) {
        document.body.removeChild(container);
        setDownloadUrl(URL.createObjectURL(doc.output('blob')));
        setIsDone(true);
      },
      x: 40,
      y: 40,
      width: 515,
      windowWidth: isTable ? 850 : 515,
      autoPaging: 'text'
    });
  };

  const handleConversion = async () => {
    if (!file) return;
    setIsConverting(true);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // --- CASE 1 & 2: WORD/EXCEL (ห้ามแก้ - ใส่โค้ดเดิมของคุณกลับมาให้ครบ) ---
      if (isWordFile) {
        const mammothLib = (window as any).mammoth;
        if (!mammothLib) throw new Error("ระบบ Word ยังไม่พร้อม");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammothLib.convertToHtml({ arrayBuffer });
        await renderHtmlToPdf(result.value);
      }
      else if (isExcelFile) {
        const XLSX = (window as any).XLSX;
        if (!XLSX) throw new Error("ระบบ Excel ยังไม่พร้อม");
        const arrayBuffer = await file.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const htmlContent = XLSX.utils.sheet_to_html(worksheet);
        await renderHtmlToPdf(htmlContent, true);
      }
      // --- CASE 3: PDF TO OTHERS (ซ่อมส่วนที่ค้างและโหลดไม่ได้) ---
      else if (file.type === 'application/pdf') {
        const pdfjsLib = (window as any).pdfjsLib;
        // ใช้ Worker จาก CDN ที่เสถียรตัวเดียว ไม่ต้อง import ซ้ำ
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (targetFormat === 'word') {
          const docxURL = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.min.js';
          await import(/* @vite-ignore */ docxURL);
          const { Document, Packer, Paragraph, TextRun } = (window as any).docx;

          const docSections = [];

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // เรียงลำดับพิกัด Y (บนลงล่าง) และ X (ซ้ายไปขวา)
            const items = textContent.items.sort((a, b) => {
              const yDiff = b.transform[5] - a.transform[5];
              if (Math.abs(yDiff) > 5) return yDiff;
              return a.transform[4] - b.transform[4];
            });

            let lastY = -1;
            let lastX = -1;
            let paragraphs = [];
            let currentLineText = "";
            let firstXInLine = -1;

            items.forEach((item: any) => {
              const currentY = item.transform[5];
              const currentX = item.transform[4];
              const text = item.str;

              // เมื่อขึ้นบรรทัดใหม่
              if (lastY !== -1 && Math.abs(currentY - lastY) > 5) {
                if (currentLineText.trim() !== "") {
                  const isThai = /[\u0E00-\u0E7F]/.test(currentLineText);

                  // จุดสำคัญ: ปรับเป็น 120+ ถึงจะมองเป็นย่อหน้า (Tab)
                  const needsIndent = firstXInLine > 120;

                  paragraphs.push(new Paragraph({
                    children: [new TextRun({
                      text: (needsIndent ? "\t" : "") + currentLineText,
                      font: isThai ? "TH Sarabun New" : "Calibri",
                      size: isThai ? 32 : 24,
                    })],
                    // ลดระยะบรรทัดให้ดูเป็นระเบียบเหมือนต้นฉบับ
                    spacing: { before: 0, after: 0, line: 300 }
                  }));
                }
                currentLineText = "";
                firstXInLine = currentX;
              }

              if (firstXInLine === -1) firstXInLine = currentX;

              // จัดการช่องว่างระหว่างกลุ่มคำ (ป้องกันคำติดกัน)
              if (lastX !== -1 && Math.abs(currentY - lastY) <= 5 && (currentX - lastX) > 10) {
                currentLineText += " ";
              }

              currentLineText += text;
              lastY = currentY;
              lastX = currentX + (item.width || 0);
            });

            // เก็บตกบรรทัดสุดท้าย
            if (currentLineText.trim() !== "") {
              const isThai = /[\u0E00-\u0E7F]/.test(currentLineText);
              paragraphs.push(new Paragraph({
                children: [new TextRun({
                  text: (firstXInLine > 120 ? "\t" : "") + currentLineText,
                  font: isThai ? "TH Sarabun New" : "Calibri",
                  size: isThai ? 32 : 24
                })],
                spacing: { before: 0, after: 0, line: 300 }
              }));
            }

            docSections.push({ children: paragraphs });
          }

          const doc = new Document({ sections: docSections });
          const blob = await Packer.toBlob(doc);
          setDownloadUrl(URL.createObjectURL(blob));
        }
        else if (targetFormat === 'excel') {
          // Logic Excel เดิมของคุณ
          const XLSX_LIB = (window as any).XLSX;
          let allData: string[][] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const lines: any = {};
            textContent.items.forEach((item: any) => {
              const y = Math.round(item.transform[5]);
              if (!lines[y]) lines[y] = [];
              lines[y].push(item);
            });
            const sortedY = Object.keys(lines).sort((a, b) => Number(b) - Number(a));
            // เปลี่ยนช่วง sortedY.forEach เป็นแบบนี้
            sortedY.forEach(y => {
              const items = lines[y].sort((a: any, b: any) => a.transform[4] - b.transform[4]);

              // map เอาเฉพาะตัวอักษรที่ตัดช่องว่างทิ้งแล้วมาใส่ Array ตรงๆ
              const row = items.map((item: any) => item.str.trim()).filter((s: string) => s !== "");

              if (row.length > 0) allData.push(row);
            });
          }
          const ws = XLSX_LIB.utils.aoa_to_sheet(allData);
          const wb = XLSX_LIB.utils.book_new();
          XLSX_LIB.utils.book_append_sheet(wb, ws, "Sheet1");
          const wbout = XLSX_LIB.write(wb, { bookType: 'xlsx', type: 'array' });
          setDownloadUrl(URL.createObjectURL(new Blob([wbout])));
        }
        else {
          // PDF to Image: ปรับให้ใช้ toBlob เพื่อลดอาการค้างและประหยัดแรม
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 2.0 });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx!, viewport }).promise;

          const mimeType = `image/${targetFormat === 'png' ? 'png' : 'jpeg'}`;

          // ใช้ toBlob แทน toDataURL เพื่อไม่ให้ Browser ค้างตอนประมวลผลไฟล์ใหญ่
          canvas.toBlob((blob) => {
            if (blob) {
              setDownloadUrl(URL.createObjectURL(blob));
              setIsDone(true); // ย้ายมาไว้ใน callback เพื่อความชัวร์
            }
          }, mimeType, 0.7); // บีบอัดคุณภาพที่ 80% เพื่อความเร็ว
        }
        setIsDone(true);
      }
      // --- CASE 4: IMAGE TO OTHERS & HEIC ---
      else {
        let currentFile: any = file;
        if (file.name.toLowerCase().endsWith('.heic')) {
          currentFile = await (window as any).heic2any({ blob: file, toType: "image/jpeg" });
        }

        const img = new Image();
        img.src = URL.createObjectURL(currentFile);
        await new Promise((resolve) => img.onload = resolve);

        const factor = unit === 'inch' ? 300 : 118.11;
        let finalW = selectedSize === 'original' ? img.width : parseFloat(customW) * factor;
        let finalH = selectedSize === 'original' ? img.height : parseFloat(customH) * factor;

        // --- เพิ่มจุดตรวจสอบ Safe Resolution ป้องกันเครื่องค้าง ---
        const MAX_RES = 4096; // ขนาดสูงสุดที่แนะนำสำหรับเบราว์เซอร์ส่วนใหญ่
        if (finalW > MAX_RES || finalH > MAX_RES) {
          const ratio = Math.min(MAX_RES / finalW, MAX_RES / finalH);
          finalW = finalW * ratio;
          finalH = finalH * ratio;
        }

        canvas.width = finalW;
        canvas.height = finalH;

        // ใช้ imageSmoothingEnabled ช่วยให้รูปที่ย่อลงมายังชัดอยู่
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, finalW, finalH);
        }

        if (targetFormat === 'pdf') {
          const { jsPDF } = (window as any).jspdf;
          const pdf = new jsPDF(canvas.width > canvas.height ? 'l' : 'p', 'px', [canvas.width, canvas.height]);
          // ใช้คุณภาพ 0.7 เพื่อลดขนาด PDF ให้โหลดไวขึ้น
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.7), 'JPEG', 0, 0, canvas.width, canvas.height);
          setDownloadUrl(URL.createObjectURL(pdf.output('blob')));
          setIsDone(true);
        } else {
          // ใช้ toBlob ร่วมกับการบีบอัดคุณภาพ 0.7 (70%)
          const mimeType = `image/${targetFormat === 'png' ? 'png' : 'jpeg'}`;
          canvas.toBlob((blob) => {
            if (blob) {
              setDownloadUrl(URL.createObjectURL(blob));
              setIsDone(true);
            }
          }, mimeType, 0.7);
        }
        URL.revokeObjectURL(img.src); // ลบ URL ชั่วคราวออกจากหน่วยความจำ
      }
    } catch (e: any) {
      console.error(e);
      alert("เกิดข้อผิดพลาด: " + e.message);
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className={`min-h-screen w-full flex flex-col transition-colors duration-500 font-sans ${isDark ? 'bg-[#030712] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <nav className={`fixed top-0 w-full z-50 border-b ${isDark ? 'bg-slate-950/80 border-white/5' : 'bg-white/80 border-slate-200'} backdrop-blur-md`}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/20">
              <Zap size={24} className="text-white fill-current" />
            </div>
            <span className="font-black text-2xl italic uppercase tracking-tighter bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              PicShift
            </span>
          </div>
          <button
            onClick={() => setIsDark(!isDark)}
            className={`p-3 rounded-2xl border transition-all hover:scale-110 active:scale-95 ${isDark ? 'bg-slate-900 border-white/10 text-yellow-400' : 'bg-white border-slate-200 text-blue-600 shadow-sm'}`}
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center pt-32 pb-20 px-6">
        {/* Main Card */}
        <div className="w-full max-w-xl mb-0">
          <div className={`rounded-[3rem] border overflow-hidden shadow-2xl transition-all duration-500 ${isDark ? 'bg-slate-900/40 border-white/10 shadow-black/50' : 'bg-white border-slate-200 shadow-slate-200'}`}>
            {!file ? (
              <label className="group cursor-pointer block">
                <input type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <div className="py-32 flex flex-col items-center text-center px-10">
                  <div className="w-24 h-24 rounded-[2.5rem] bg-blue-600/10 text-blue-500 border border-blue-500/20 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-xl shadow-blue-500/5">
                    <FileUp size={44} />
                  </div>
                  <h2 className="text-3xl font-black mb-3 tracking-tight">Drop your file here</h2>
                  <p className="text-sm opacity-50 font-medium max-w-[280px] leading-relaxed">
                    Convert JPG, PNG, HEIC, PDF, DOCX, and XLSX documents instantly in your browser.
                  </p>
                  <div className="mt-8 flex gap-2">
                    {['SECURE', 'LOCAL', 'OFFICE READY'].map(t => (
                      <span key={t} className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-[9px] font-black tracking-widest">{t}</span>
                    ))}
                  </div>
                </div>
              </label>
            ) : (
              <div className="p-10 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className={`flex items-center gap-5 p-5 rounded-[2rem] border ${isDark ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${(file.type === 'application/pdf' || isWordFile || isExcelFile) ? 'bg-rose-500/20 text-rose-500' : 'bg-blue-500/20 text-blue-500'}`}>
                    {(file.type === 'application/pdf' || isWordFile || isExcelFile) ? <FileText size={28} /> : <ImageIcon size={28} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-black truncate leading-tight mb-1">{file.name}</p>
                    <p className="text-xs opacity-40 font-bold uppercase tracking-widest">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <button onClick={resetApp} className="p-2 hover:bg-rose-500/10 hover:text-rose-500 rounded-full transition-all"><X size={24} /></button>
                </div>

                {!isDone ? (
                  <div className="space-y-10">
                    <div className="space-y-4">
                      <label className="text-xs font-black uppercase tracking-widest opacity-40 px-2">Convert to</label>
                      <div className="grid grid-cols-3 gap-3">
                        {(isWordFile || isExcelFile
                          ? ['pdf']
                          : file.type === 'application/pdf'
                            ? ['jpg', 'png', 'word', 'excel']
                            : ['jpg', 'png', 'pdf']
                        ).map(fmt => (
                          <button
                            key={fmt}
                            onClick={() => setTargetFormat(fmt)}
                            className={`py-5 rounded-2xl font-black text-sm uppercase transition-all border-2 
                              ${targetFormat === fmt
                                ? 'bg-blue-600 border-blue-600 text-white shadow-2xl shadow-blue-500/40 scale-[1.02]'
                                : 'bg-transparent border-slate-200 dark:border-white/5 opacity-40 hover:opacity-100'}`}
                          >
                            {fmt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {file.type !== 'application/pdf' && !isWordFile && !isExcelFile && (
                      <div className="space-y-6">
                        <label className="text-xs font-black uppercase tracking-widest opacity-40 px-2">Dimension Settings</label>
                        <div className="flex bg-slate-200/50 dark:bg-black/40 p-2 rounded-[1.5rem] border border-slate-200 dark:border-white/5">
                          {['original', 'custom'].map(m => (
                            <button
                              key={m}
                              onClick={() => setSelectedSize(m)}
                              className={`flex-1 py-4 rounded-xl font-black text-xs uppercase transition-all duration-300 
                                ${selectedSize === m
                                  ? 'bg-white dark:bg-slate-800 text-white dark:text-white shadow-lg'
                                  : 'text-slate-500 dark:text-slate-500 hover:text-blue-600 dark:hover:text-white'}`}
                            >
                              {m === 'original' ? 'Original Size' : 'Custom Size'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedSize === 'custom' && file.type !== 'application/pdf' && !isWordFile && !isExcelFile && (
                      <div className={`p-8 rounded-[2.5rem] border animate-in slide-in-from-top-2 duration-300 ${isDark ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'} space-y-8`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black opacity-40 uppercase tracking-widest">Select Unit</span>
                          <div className="flex gap-2 p-1 bg-slate-200 dark:bg-slate-800 rounded-xl">
                            {['cm', 'inch'].map(u => (
                              <button
                                key={u}
                                onClick={() => setUnit(u)}
                                className={`px-5 py-2 rounded-lg text-[10px] font-black transition-all 
                                  ${unit === u
                                    ? 'bg-blue-600 text-white shadow-lg'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                              >
                                {u}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <span className="text-[10px] font-black opacity-30 uppercase text-center block">Width</span>
                            <input type="number" value={customW} onChange={(e) => setCustomW(e.target.value)} className={`w-full p-5 rounded-2xl text-center font-black text-2xl outline-none ring-blue-500/40 focus:ring-4 transition-all ${isDark ? 'bg-slate-800 text-white' : 'bg-white text-slate-900 border border-slate-200'}`} />
                          </div>
                          <div className="space-y-3">
                            <span className="text-[10px] font-black opacity-30 uppercase text-center block">Height</span>
                            <input type="number" value={customH} onChange={(e) => setCustomH(e.target.value)} className={`w-full p-5 rounded-2xl text-center font-black text-2xl outline-none ring-blue-500/40 focus:ring-4 transition-all ${isDark ? 'bg-slate-800 text-white' : 'bg-white text-slate-900 border border-slate-200'}`} />
                          </div>
                        </div>
                      </div>
                    )}

                    <button onClick={handleConversion} disabled={isConverting} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-6 rounded-[2rem] font-black text-lg text-white shadow-[0_20px_50px_rgba(37,99,235,0.3)] flex items-center justify-center gap-4 transition-all active:scale-[0.97] group">
                      {isConverting ? <Loader2 className="animate-spin" size={28} /> : <>Convert Now <ChevronRight size={24} className="group-hover:translate-x-1 transition-transform" /></>}
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-10 space-y-10 animate-in zoom-in-95 duration-700">
                    <div className="w-32 h-32 bg-emerald-500/10 text-emerald-500 rounded-[3.5rem] flex items-center justify-center mx-auto border border-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.15)]">
                      <CheckCircle2 size={64} />
                    </div>
                    <div>
                      <h3 className="text-4xl font-black mb-2 italic tracking-tighter uppercase leading-none">Success!</h3>
                      <p className="text-xs opacity-40 font-bold uppercase tracking-[0.2em]">Your file is ready for download</p>
                    </div>
                    <div className="space-y-4 pt-6">
                      <a href={downloadUrl!} download={`PicShift_${targetFormat}_${Date.now()}.${targetFormat === 'word' ? 'docx' : targetFormat === 'excel' ? 'xlsx' : targetFormat}`} className="w-full bg-emerald-600 hover:bg-emerald-500 py-6 rounded-[2rem] text-white font-black text-lg flex items-center justify-center gap-4 shadow-[0_20px_40px_rgba(16,185,129,0.25)] transition-all active:scale-95">
                        <Download size={28} /> <span>Download Result</span>
                      </a>
                      <button onClick={resetApp} className="text-[11px] font-black uppercase tracking-[0.5em] opacity-20 hover:opacity-100 transition-all pt-4">
                        Convert another file
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="mt-8 text-center text-[10px] font-bold opacity-20 uppercase tracking-[0.3em]">
            Privacy Guaranteed • 100% Client-Side Processing
          </p>
        </div>

        {/* Features Grid */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-8 mt-0 border-t border-white/5 pt-20">
          <div className="space-y-4">
            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500">
              <ShieldCheck size={24} />
            </div>
            <h4 className="font-black text-lg">Secure & Private</h4>
            <p className="text-sm opacity-50 leading-relaxed">Your files never leave your computer. All processing happens locally in your browser, ensuring maximum privacy.</p>
          </div>
          <div className="space-y-4">
            <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-500">
              <Globe size={24} />
            </div>
            <h4 className="font-black text-lg">Universal Formats</h4>
            <p className="text-sm opacity-50 leading-relaxed">Seamlessly convert between JPG, PNG, PDF, DOCX, and XLSX. Full support for modern Apple HEIC files.</p>
          </div>
          <div className="space-y-4">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
              <Cpu size={24} />
            </div>
            <h4 className="font-black text-lg">Smart Resizing</h4>
            <p className="text-sm opacity-50 leading-relaxed">Need specific dimensions for printing or web? Use our custom scaling tool with CM and Inch support.</p>
          </div>
        </div>

        <div className="w-full max-w-4xl mt-32 space-y-24">
          <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 text-blue-500 text-[10px] font-black tracking-widest uppercase">
                <BookOpen size={14} /> Technology
              </div>
              <h3 className="text-3xl font-black tracking-tight leading-tight">
                High-Fidelity Document <br />
                <span className="text-blue-500">Multi-Language Rendering</span>
              </h3>
              <p className="opacity-60 leading-relaxed text-sm">
                PicShift uses advanced client-side rendering to ensure your documents look identical to the original. Our engine supports complex character sets, including **Full Thai Font integration (TH Sarabun New)**, preventing layout issues.
              </p>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs uppercase">
                  <CheckCircle2 size={16} /> Thai Font Ready
                </div>
                <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs uppercase">
                  <CheckCircle2 size={16} /> Office Support
                </div>
              </div>
            </div>
            <div className={`p-8 rounded-[2.5rem] border ${isDark ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-200'} shadow-xl`}>
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-black opacity-40 uppercase">Excel & Word Engine</span>
                  <span className="text-[10px] font-black text-blue-500 uppercase">Active</span>
                </div>
                <div className="h-2 w-full bg-blue-500/20 rounded-full"></div>
                <div className="h-2 w-5/6 bg-slate-500/10 rounded-full"></div>
                <div className="h-2 w-full bg-slate-500/10 rounded-full"></div>
              </div>
            </div>
          </section>

          <section className="space-y-12">
            <div className="text-center space-y-4">
              <h3 className="text-3xl font-black tracking-tight">Frequently Asked Questions</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  q: "Is my data safe with PicShift?",
                  a: "Absolutely. We utilize 100% Client-Side processing. Your files never touch our servers."
                },
                {
                  q: "Does it support Thai fonts?",
                  a: "Yes! Our PDF engine is pre-loaded with TH Sarabun New to ensure perfect rendering without broken characters."
                },
                {
                  q: "Can I convert Excel to PDF?",
                  a: "Yes, PicShift now supports XLSX to PDF conversion with table formatting preserved."
                },
                {
                  q: "Is PicShift free?",
                  a: "100% free with no registration or daily limits."
                }
              ].map((faq, i) => (
                <div key={i} className={`p-8 rounded-3xl border ${isDark ? 'bg-slate-900/50 border-white/5' : 'bg-white border-slate-200'} space-y-4`}>
                  <div className="flex items-center gap-3 text-blue-500">
                    <HelpCircle size={20} />
                    <h5 className="font-black text-sm uppercase tracking-tight">{faq.q}</h5>
                  </div>
                  <p className="text-sm opacity-60 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </section>

          {/* New Section: Privacy Policy & Security (ADDED) */}
          <section className={`rounded-[3rem] p-12 text-center space-y-8 transition-all duration-500 ${isDark ? 'bg-blue-600/5 border border-blue-500/10' : 'bg-blue-50 border border-blue-100'}`}>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-lg ${isDark ? 'bg-blue-600/20 text-blue-400' : 'bg-white text-blue-600'}`}>
              <Lock size={32} />
            </div>
            <h3 className="text-3xl font-black tracking-tight">Privacy Policy & Security</h3>
            <p className={`max-w-2xl mx-auto leading-relaxed ${isDark ? 'opacity-60' : 'text-slate-600'}`}>
              We value your privacy. <span className="font-bold text-blue-500">PicShift</span> does not collect personal data, usage patterns, or store your files. Everything is processed via your browser's memory and cleared instantly once you close the session.
            </p>
          </section>
        </div>
      </main>

      {/* Footer (MODIFIED TO INCLUDE LINKS) */}
      <footer className="py-20 border-t border-white/5 flex flex-col items-center gap-8">
        <div className="flex flex-wrap justify-center gap-x-12 gap-y-4">
          {['Privacy Policy', 'Terms of Service', 'About Us'].map(link => (
            <a key={link} href="#" className="text-[11px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">
              {link}
            </a>
          ))}
        </div>
        <p className="text-[10px] font-bold opacity-20 uppercase tracking-[0.2em]">
          © 2026 PicShift Global • Built for the Modern Web
        </p>
      </footer>
    </div>
  );
}