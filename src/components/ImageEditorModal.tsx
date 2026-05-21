import React, { useRef, useState, useEffect } from 'react';
import { X, Crop, Image as ImageIcon, Wand2, Paintbrush, Undo2, Ban, Check, Loader2, Save } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface ImageEditorModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  onSave: (editedBase64: string) => void;
  removeBgApiHandler: (base64: string) => Promise<string | null>;
}

type EditorTool = 'crop' | 'filter' | 'eraser' | 'logo' | null;

interface FilterState {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
}

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
  isOpen,
  imageUrl,
  onClose,
  onSave,
  removeBgApiHandler,
}) => {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Base Image State
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [currentTool, setCurrentTool] = useState<EditorTool>(null);
  
  // Undo/Redo stack for Eraser and overarching states (simplified for now to basic loading/saving)
  const [isProcessingBg, setIsProcessingBg] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Filters state
  const [filters, setFilters] = useState<FilterState>({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    grayscale: 0,
  });

  // Eraser state
  const [brushSize, setBrushSize] = useState<number>(20);
  const [isDrawing, setIsDrawing] = useState(false);
  const [eraserStrokes, setEraserStrokes] = useState<any[]>([]); // simplified path storage
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);

  // Logo Overlay state
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);
  const [logoPos, setLogoPos] = useState({ x: 50, y: 50, scale: 0.3 });
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);

  // Zoom / Pan state (for crop/view)
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Load Image when opened
  useEffect(() => {
    if (isOpen && imageUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setBaseImage(img);
        // Reset states
        setFilters({ brightness: 100, contrast: 100, saturation: 100, grayscale: 0 });
        setEraserStrokes([]);
        setLogoImage(null);
        setScale(1);
        setOffset({ x: 0, y: 0 });
        setCurrentTool(null);
      };
      img.src = imageUrl;
    }
  }, [isOpen, imageUrl]);

  // Main Render Loop
  useEffect(() => {
    if (!baseImage || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const canvas = canvasRef.current;
    
    // Set internal canvas resolution strictly to original image bounds for export quality
    const targetWidth = baseImage.width;
    const targetHeight = baseImage.height;
    
    // Resize canvas internal buffer only if it changed
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Base Image with Filters
    ctx.save();
    
    // Apply Transform (Pan/Zoom) - Only affects view, logic here is slightly reversed for export
    // For simplicity in V1, we will apply Pan/Zoom logic purely on CSS level or export bounds 
    // Wait, if it's an editor, the whole canvas should be output. 
    // We will draw normally, and use CSS transform for zooming to make eraser math simpler.
    
    ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%) grayscale(${filters.grayscale}%)`;
    ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // 2. Apply Eraser strokes (using destination-out)
    if (eraserStrokes.length > 0 || currentStrokeRef.current.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      const drawPath = (points: {x: number, y: number}[], size: number) => {
        if (points.length < 2) return;
        ctx.beginPath();
        ctx.lineWidth = size;
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
      };

      eraserStrokes.forEach(stroke => drawPath(stroke.points, stroke.size));
      if (currentStrokeRef.current.length > 0) {
        drawPath(currentStrokeRef.current, brushSize);
      }
      ctx.restore();
    }

    // 3. Draw Logo Overlay
    if (logoImage) {
      ctx.save();
      const lw = logoImage.width * logoPos.scale;
      const lh = logoImage.height * logoPos.scale;
      ctx.drawImage(logoImage, logoPos.x, logoPos.y, lw, lh);
      // Draw border if logo tool is active
      if (currentTool === 'logo') {
        ctx.strokeStyle = '#f97316'; // orange-500
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(logoPos.x, logoPos.y, lw, lh);
      }
      ctx.restore();
    }

  }, [baseImage, filters, eraserStrokes, logoImage, logoPos, currentTool, isDrawing]);

  // Handle Mouse Events on Canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Calculate actual coordinate space relative to CSS scale
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (currentTool === 'eraser') {
      setIsDrawing(true);
      currentStrokeRef.current = [{ x, y }];
    } else if (currentTool === 'logo' && logoImage) {
      // Check if clicking inside logo bounds
      const lw = logoImage.width * logoPos.scale;
      const lh = logoImage.height * logoPos.scale;
      if (x >= logoPos.x && x <= logoPos.x + lw && y >= logoPos.y && y <= logoPos.y + lh) {
        setIsDraggingLogo(true);
        dragStartRef.current = { x: x - logoPos.x, y: y - logoPos.y };
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (currentTool === 'eraser' && isDrawing) {
      currentStrokeRef.current.push({ x, y });
      // Force re-render dependency
      setOffset(prev => ({ ...prev }));
    } else if (currentTool === 'logo' && isDraggingLogo) {
      setLogoPos(prev => ({
        ...prev,
        x: x - dragStartRef.current.x,
        y: y - dragStartRef.current.y
      }));
    }
  };

  const handlePointerUp = () => {
    if (currentTool === 'eraser' && isDrawing) {
      setIsDrawing(false);
      setEraserStrokes(prev => [...prev, { points: [...currentStrokeRef.current], size: brushSize }]);
      currentStrokeRef.current = [];
    }
    setIsDraggingLogo(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (currentTool === 'logo' && logoImage) {
      // Prevent page scrolling while scaling logo
      e.preventDefault();
      
      const delta = e.deltaY * -0.001;
      const newScale = Math.min(Math.max(0.05, logoPos.scale + delta), 3);
      
      setLogoPos(prev => ({ ...prev, scale: newScale }));
    }
  };

  const handleRemoveBg = async () => {
    if (!canvasRef.current) return;
    setIsProcessingBg(true);
    try {
      // Send current canvas state to Remove.bg
      const currentDataUrl = canvasRef.current.toDataURL('image/png');
      const result = await removeBgApiHandler(currentDataUrl);
      if (result) {
        const img = new Image();
        img.onload = () => {
          setBaseImage(img);
          setEraserStrokes([]); // Clear eraser strokes since bg is removed
        };
        img.src = result;
      }
    } catch (e) {
      console.error(e);
      alert("Remove BG Failed.");
    } finally {
      setIsProcessingBg(false);
    }
  };

  const handleSave = () => {
    if (!canvasRef.current) return;
    setIsSaving(true);
    // Export at full resolution
    const dataUrl = canvasRef.current.toDataURL('image/png', 1.0);
    onSave(dataUrl);
    setIsSaving(false);
    onClose();
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          setLogoImage(img);
          setCurrentTool('logo');
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className={`w-full max-w-6xl h-[90vh] flex flex-col rounded-3xl overflow-hidden shadow-2xl ${theme === 'dark' ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-slate-200'}`}>
        
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${theme === 'dark' ? 'border-gray-800' : 'border-slate-200'}`}>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-500 rounded-lg text-white">
              <Paintbrush className="w-5 h-5" />
            </div>
            <h2 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>PicSeller Editor</h2>
          </div>
          <div className="flex items-center space-x-4">
            <button 
              onClick={onClose}
              className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-slate-100 text-slate-500'}`}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Left Sidebar - Tools */}
          <div className={`w-64 flex flex-col border-r ${theme === 'dark' ? 'border-gray-800 bg-gray-900/50' : 'border-slate-200 bg-slate-50'}`}>
            
            {/* Tool Selector */}
            <div className="p-4 space-y-2">
              <button 
                onClick={() => setCurrentTool('filter')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${currentTool === 'filter' ? 'bg-orange-500 text-white shadow-lg' : theme === 'dark' ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-white text-slate-600'}`}
              >
                <Wand2 className="w-5 h-5" />
                <span className="font-semibold">Adjust & Filter</span>
              </button>
              
              <button 
                onClick={() => setCurrentTool('eraser')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${currentTool === 'eraser' ? 'bg-orange-500 text-white shadow-lg' : theme === 'dark' ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-white text-slate-600'}`}
              >
                <Ban className="w-5 h-5" />
                <span className="font-semibold">Magic Eraser</span>
              </button>

              <button 
                onClick={() => setCurrentTool('logo')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${currentTool === 'logo' ? 'bg-orange-500 text-white shadow-lg' : theme === 'dark' ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-white text-slate-600'}`}
              >
                <ImageIcon className="w-5 h-5" />
                <span className="font-semibold">Add Logo / Watermark</span>
              </button>
            </div>

            <div className={`h-px w-full ${theme === 'dark' ? 'bg-gray-800' : 'bg-slate-200'}`} />

            {/* AI Magic Tools */}
            <div className="p-4 flex-1">
              <h3 className={`text-xs font-bold uppercase tracking-wider mb-4 ${theme === 'dark' ? 'text-gray-500' : 'text-slate-400'}`}>AI Magic</h3>
              <button
                onClick={handleRemoveBg}
                disabled={isProcessingBg}
                className="w-full relative overflow-hidden group rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-[1px] shadow-lg shadow-blue-500/20"
              >
                <div className="absolute inset-0 bg-white/20 group-hover:bg-white/0 transition-colors" />
                <div className="relative px-4 py-3 bg-gray-900 rounded-xl flex items-center justify-center space-x-2">
                  {isProcessingBg ? <Loader2 className="w-5 h-5 text-blue-400 animate-spin" /> : <Wand2 className="w-5 h-5 text-blue-400" />}
                  <span className="font-bold text-white">Remove Background</span>
                </div>
              </button>
            </div>

            {/* Tool Properties Panel (Dynamic) */}
            <div className={`p-4 border-t h-64 overflow-y-auto ${theme === 'dark' ? 'border-gray-800' : 'border-slate-200'}`}>
              {currentTool === 'filter' && (
                <div className="space-y-4">
                  <div>
                    <label className={`block text-xs font-bold mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-slate-500'}`}>BRIGHTNESS ({filters.brightness}%)</label>
                    <input type="range" min="0" max="200" value={filters.brightness} onChange={e => setFilters({...filters, brightness: Number(e.target.value)})} className="w-full accent-orange-500" />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-slate-500'}`}>CONTRAST ({filters.contrast}%)</label>
                    <input type="range" min="0" max="200" value={filters.contrast} onChange={e => setFilters({...filters, contrast: Number(e.target.value)})} className="w-full accent-orange-500" />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-slate-500'}`}>SATURATION ({filters.saturation}%)</label>
                    <input type="range" min="0" max="200" value={filters.saturation} onChange={e => setFilters({...filters, saturation: Number(e.target.value)})} className="w-full accent-orange-500" />
                  </div>
                </div>
              )}

              {currentTool === 'eraser' && (
                <div className="space-y-4">
                  <div>
                    <label className={`block text-xs font-bold mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-slate-500'}`}>BRUSH SIZE ({brushSize}px)</label>
                    <input type="range" min="5" max="100" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="w-full accent-orange-500" />
                  </div>
                  <button 
                    onClick={() => setEraserStrokes([])}
                    className={`w-full py-2 rounded-lg text-sm font-semibold border ${theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`}
                  >
                    Clear All Strokes
                  </button>
                </div>
              )}

              {currentTool === 'logo' && (
                <div className="space-y-4">
                  <label className={`w-full flex items-center justify-center space-x-2 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${theme === 'dark' ? 'border-gray-700 hover:border-orange-500 text-gray-400' : 'border-slate-300 hover:border-orange-500 text-slate-500'}`}>
                    <ImageIcon className="w-5 h-5" />
                    <span className="font-semibold text-sm">Upload Logo PNG</span>
                    <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleLogoUpload} />
                  </label>
                  {logoImage && (
                    <div>
                      <label className={`block text-xs font-bold mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-slate-500'}`}>LOGO SCALE ({(logoPos.scale * 100).toFixed(0)}%)</label>
                      <input type="range" min="0.05" max="3" step="0.01" value={logoPos.scale} onChange={e => setLogoPos({...logoPos, scale: Number(e.target.value)})} className="w-full accent-orange-500" />
                      <p className={`text-xs mt-2 ${theme === 'dark' ? 'text-gray-500' : 'text-slate-400'}`}>Drag logo on canvas to position. Scroll mouse wheel to resize.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Center Canvas Area */}
          <div className="flex-1 relative flex flex-col overflow-hidden bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYNgfQMgmwsnAgP4Pk2dgwA5YwiThp2bVQDIwA2EWM3H4g48fDA0gAAAhVwkX1q1L4AAAAABJRU5ErkJggg==')]">
            {/* Toolbar Top */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center space-x-2 bg-gray-900/80 backdrop-blur-md px-4 py-2 rounded-2xl shadow-xl">
              <button onClick={() => setScale(s => Math.max(0.2, s - 0.1))} className="text-white hover:text-orange-400 font-bold px-2">-</button>
              <span className="text-white font-mono text-sm">{(scale * 100).toFixed(0)}%</span>
              <button onClick={() => setScale(s => Math.min(3, s + 0.1))} className="text-white hover:text-orange-400 font-bold px-2">+</button>
              <div className="w-px h-4 bg-gray-700 mx-2" />
              <button onClick={() => setScale(1)} className="text-gray-300 hover:text-white text-xs uppercase font-bold px-2">Fit</button>
            </div>

            {/* Canvas Container */}
            <div className="flex-1 overflow-auto flex items-center justify-center touch-none">
              <div 
                className="relative shadow-2xl transition-transform duration-100 ease-out"
                style={{ transform: `scale(${scale})` }}
              >
                {!baseImage && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>}
                <canvas
                  ref={canvasRef}
                  className={`${currentTool === 'eraser' ? 'cursor-crosshair' : currentTool === 'logo' ? 'cursor-move' : 'cursor-default'}`}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  onWheel={handleWheel}
                  style={{ touchAction: 'none' }}
                />
              </div>
            </div>

            {/* Bottom Actions */}
            <div className={`absolute bottom-0 left-0 right-0 p-4 border-t flex justify-end space-x-3 bg-opacity-90 backdrop-blur-md ${theme === 'dark' ? 'border-gray-800 bg-gray-900' : 'border-slate-200 bg-white'}`}>
              <button 
                onClick={onClose}
                className={`px-6 py-2.5 rounded-xl font-bold transition-colors ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-800' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving || !baseImage || isProcessingBg}
                className="flex items-center space-x-2 px-8 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold shadow-lg shadow-orange-500/25 transition-all disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
