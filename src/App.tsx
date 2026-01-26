import { useState, useEffect, useCallback } from 'react';
import { 
  FileUp, X, CheckCircle2, Download, Zap, 
  ImageIcon, Loader2, Sun, Moon,
  FileText, ChevronRight, ShieldCheck, Globe, Cpu
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import heic2any from 'heic2any';
import mammoth from 'mammoth';
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

  const isWordFile = file?.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file?.name.toLowerCase().endsWith('.docx');

  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDark]);

  useEffect(() => {
    if (isWordFile) {
      setTargetFormat('pdf');
    }
  }, [isWordFile]);

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

  const handleConversion = async () => {
    if (!file) return;
    setIsConverting(true);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // --- 1. WORD TO PDF (แก้ไขภาษาไทย) ---
      if (isWordFile) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const htmlContent = result.value;

        const doc = new jsPDF('p', 'pt', 'a4');

        // ฝังฟอนต์ไทยลงใน PDF (เช็คค่าจาก Import)
        if (THAI_FONT_BASE64 && THAI_FONT_BASE64.length > 100) {
          doc.addFileToVFS("Sarabun.ttf", THAI_FONT_BASE64);
          doc.addFont("Sarabun.ttf", "Sarabun", "normal");
          doc.setFont("Sarabun");
        }

        const container = document.createElement('div');
        // แก้ไข Style ตรงนี้เพื่อให้รองรับภาษาไทยขณะ Render
        container.style.width = '500px'; 
        container.style.padding = '40px';
        container.style.backgroundColor = '#ffffff';
        container.style.color = '#000000';
        // บังคับใช้ฟอนต์ Sarabun
        container.style.fontFamily = 'Sarabun'; 
        container.style.fontSize = '14pt';
        container.style.lineHeight = '1.6';
        container.innerHTML = htmlContent;

        // บังคับให้สระไม่ลอยโดยการนำไปวางใน DOM ชั่วคราว
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
          windowWidth: 515,
          autoPaging: 'text' // ช่วยเรื่องการตัดหน้าที่มีภาษาไทย
        });
      }
      // --- 2. PDF LOGIC (คงเดิม) ---
      else if (file.type === 'application/pdf') {
        const pdfjsURL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
        const pdfjsLib = await import(/* @vite-ignore */ pdfjsURL);
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
        
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        if (targetFormat === 'word') {
          const docxURL = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.min.js';
          await import(/* @vite-ignore */ docxURL);
          let fullText = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map((item: any) => item.str).join(' ') + "\n\n";
          }
          const { Document, Packer, Paragraph, TextRun } = (window as any).docx;
          const doc = new Document({
            sections: [{ children: [new Paragraph({ children: [new TextRun(fullText)] })] }],
          });
          const blob = await Packer.toBlob(doc);
          setDownloadUrl(URL.createObjectURL(blob));
          setIsDone(true);
        } else {
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 2.0 });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx!, viewport }).promise;

          canvas.toBlob((blob) => {
            if (blob) {
              setDownloadUrl(URL.createObjectURL(blob));
              setIsDone(true);
            }
          }, `image/${targetFormat === 'png' ? 'png' : 'jpeg'}`, 0.9);
        }
      } 
      // --- 3. IMAGE CONVERSION (คงเดิม) ---
      else {
        let currentFile: any = file;
        if (file.name.toLowerCase().endsWith('.heic')) {
          currentFile = await heic2any({ blob: file, toType: "image/jpeg" });
        }
        
        const img = new Image();
        const objectUrl = URL.createObjectURL(currentFile);
        img.src = objectUrl;
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        const factor = unit === 'inch' ? 300 : 118.11;
        let finalW = selectedSize === 'original' ? img.width : parseFloat(customW) * factor;
        let finalH = selectedSize === 'original' ? img.height : parseFloat(customH) * factor;
        
        canvas.width = finalW;
        canvas.height = finalH;
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectUrl);

        if (targetFormat === 'pdf') {
          const pdf = new jsPDF(canvas.width > canvas.height ? 'l' : 'p', 'px', [canvas.width, canvas.height]);
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, canvas.width, canvas.height);
          setDownloadUrl(URL.createObjectURL(pdf.output('blob')));
          setIsDone(true);
        } else {
          canvas.toBlob((blob) => {
            if (blob) {
              setDownloadUrl(URL.createObjectURL(blob));
              setIsDone(true);
            }
          }, `image/${targetFormat === 'png' ? 'png' : 'jpeg'}`, 0.9);
        }
      }
    } catch (e) {
      console.error(e);
      alert("Conversion failed. Please try a different file.");
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
        <div className="w-full max-w-xl mb-20">
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
                    Convert JPG, PNG, HEIC, PDF, and DOCX documents instantly in your browser.
                  </p>
                  <div className="mt-8 flex gap-2">
                    {['SECURE','LOCAL','FAST'].map(t => (
                      <span key={t} className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-[9px] font-black tracking-widest">{t}</span>
                    ))}
                  </div>
                </div>
              </label>
            ) : (
              <div className="p-10 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className={`flex items-center gap-5 p-5 rounded-[2rem] border ${isDark ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${ (file.type === 'application/pdf' || isWordFile) ? 'bg-rose-500/20 text-rose-500' : 'bg-blue-500/20 text-blue-500'}`}>
                    {(file.type === 'application/pdf' || isWordFile) ? <FileText size={28} /> : <ImageIcon size={28} />}
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
                        {(isWordFile ? ['pdf'] : file.type === 'application/pdf' ? ['jpg', 'png', 'word'] : ['jpg', 'png', 'pdf']).map(fmt => (
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

                    {file.type !== 'application/pdf' && !isWordFile && (
                      <div className="space-y-6">
                        <label className="text-xs font-black uppercase tracking-widest opacity-40 px-2">Dimension Settings</label>
                        <div className="flex bg-slate-100 dark:bg-black/40 p-2 rounded-[1.5rem] border border-white/5">
                          {['original', 'custom'].map(m => (
                            <button key={m} onClick={() => setSelectedSize(m)} className={`flex-1 py-4 rounded-xl font-black text-xs uppercase transition-all duration-300 ${selectedSize === m ? 'bg-white dark:bg-slate-800 text-blue-500 shadow-xl' : 'opacity-40 hover:opacity-60'}`}>
                              {m === 'original' ? 'Original Size' : 'Custom Size'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedSize === 'custom' && file.type !== 'application/pdf' && !isWordFile && (
                      <div className={`p-8 rounded-[2.5rem] border animate-in slide-in-from-top-2 duration-300 ${isDark ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'} space-y-8`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black opacity-40 uppercase tracking-widest">Select Unit</span>
                          <div className="flex gap-2 p-1 bg-slate-200 dark:bg-slate-800 rounded-xl">
                            {['cm', 'inch'].map(u => (
                              <button key={u} onClick={() => setUnit(u)} className={`px-5 py-2 rounded-lg text-[10px] font-black transition-all ${unit === u ? 'bg-blue-600 text-white shadow-lg' : 'opacity-40'}`}>{u}</button>
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
                      {isConverting ? <Loader2 className="animate-spin" size={28} /> : <>Convert Now <ChevronRight size={24} className="group-hover:translate-x-1 transition-transform"/></>}
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
                      <a href={downloadUrl!} download={`PicShift_${targetFormat}_${Date.now()}.${targetFormat === 'word' ? 'docx' : targetFormat}`} className="w-full bg-emerald-600 hover:bg-emerald-500 py-6 rounded-[2rem] text-white font-black text-lg flex items-center justify-center gap-4 shadow-[0_20px_40px_rgba(16,185,129,0.25)] transition-all active:scale-95">
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

        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-8 mt-10 border-t border-white/5 pt-20">
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
            <p className="text-sm opacity-50 leading-relaxed">Seamlessly convert between JPG, PNG, PDF, and DOCX. Full support for modern Apple HEIC files.</p>
          </div>
          <div className="space-y-4">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
              <Cpu size={24} />
            </div>
            <h4 className="font-black text-lg">Smart Resizing</h4>
            <p className="text-sm opacity-50 leading-relaxed">Need specific dimensions for printing or web? Use our custom scaling tool with CM and Inch support.</p>
          </div>
        </div>
      </main>

      <footer className="py-10 border-t border-white/5 text-center">
        <p className="text-[10px] font-bold opacity-20 uppercase tracking-[0.2em]">© 2024 PicShift Global • Built for the Modern Web</p>
      </footer>
    </div>
  );
}