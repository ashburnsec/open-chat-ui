'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Copy,
  Download,
  ImageIcon,
  Loader2,
  RotateCcw,
  Trash2,
  Type,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * P 图编辑器主组件. HTML + CSS + html-to-image 路径 (非 Konva).
 *
 * 数据模型: 每个 layer 是 absolute-positioned 的 React 组件, 用 transform
 * 控制位置/旋转/缩放. 选中态 + 属性面板编辑. mousedown/move/up 实现拖拽.
 *
 * 导出: html-to-image 把 .editor-canvas 整个 div 渲染成 PNG dataURL,
 * 浏览器直接下载 (不走 conv-svc 落盘 — 用户随后能再上传/分享自定).
 */

type TextLayer = {
  id: string;
  type: 'text';
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  rotation: number;
  opacity: number;
  bold: boolean;
};

type ImageLayer = {
  id: string;
  type: 'image';
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
};

type EditableLayer = TextLayer | ImageLayer;

const CANVAS_W = 720;
const CANVAS_H = 720;

function genId(): string {
  return `l-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ImageEditor({ sourceUrl }: { sourceUrl: string }) {
  const t = useTranslations('editor');
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [layers, setLayers] = useState<EditableLayer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const selected = layers.find((l) => l.id === selectedId) ?? null;

  function update<L extends EditableLayer>(id: string, patch: Partial<L>) {
    setLayers((prev) => prev.map((l) => (l.id === id ? ({ ...l, ...patch } as EditableLayer) : l)));
  }

  function deleteLayer(id: string) {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function addText(text = t('newText')) {
    const layer: TextLayer = {
      id: genId(),
      type: 'text',
      text,
      x: CANVAS_W / 2,
      y: CANVAS_H / 2,
      fontSize: 36,
      color: '#ffffff',
      rotation: 0,
      opacity: 1,
      bold: true,
    };
    setLayers((prev) => [...prev, layer]);
    setSelectedId(layer.id);
  }

  function addWatermark() {
    const layer: TextLayer = {
      id: genId(),
      type: 'text',
      text: t('watermarkDefault'),
      x: CANVAS_W - 100,
      y: CANVAS_H - 30,
      fontSize: 18,
      color: '#ffffff',
      rotation: 0,
      opacity: 0.5,
      bold: false,
    };
    setLayers((prev) => [...prev, layer]);
    setSelectedId(layer.id);
  }

  async function pickLogoFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error(t('notImage'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const max = 200;
        const scale = Math.min(max / img.width, max / img.height, 1);
        const layer: ImageLayer = {
          id: genId(),
          type: 'image',
          src: dataUrl,
          x: CANVAS_W / 2,
          y: CANVAS_H / 2,
          width: img.width * scale,
          height: img.height * scale,
          rotation: 0,
          opacity: 1,
        };
        setLayers((prev) => [...prev, layer]);
        setSelectedId(layer.id);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async function downloadPng() {
    if (!canvasRef.current || exporting) return;
    setExporting(true);
    setSelectedId(null); // 取消选中, 不让选中边框出现在导出图里
    try {
      // 等一帧让 selectedId 变化的 re-render 完成
      await new Promise((r) => requestAnimationFrame(r));
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(canvasRef.current, {
        cacheBust: true,
        pixelRatio: 2, // 2× 输出, 适合分辨率原本就高的图
        skipFonts: false,
      });
      const link = document.createElement('a');
      link.download = `edited-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('exportFailed'));
    } finally {
      setExporting(false);
    }
  }

  // 点击空白处取消选中
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current) setSelectedId(null);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b bg-card/60 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            {t('back')}
          </Button>
          <span className="text-sm text-muted-foreground">{t('title')}</span>
        </div>
        <Button size="sm" onClick={() => void downloadPng()} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {t('download')}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left tools */}
        <aside className="flex w-44 shrink-0 flex-col gap-1 border-r bg-card/40 p-2">
          <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('toolsLabel')}
          </p>
          <ToolButton icon={<Type className="h-3.5 w-3.5" />} onClick={() => addText()} label={t('addText')} />
          <ToolButton
            icon={<ImageIcon className="h-3.5 w-3.5" />}
            onClick={() => fileInputRef.current?.click()}
            label={t('addLogo')}
          />
          <ToolButton icon={<Copy className="h-3.5 w-3.5" />} onClick={addWatermark} label={t('addWatermark')} />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pickLogoFile(f);
              e.target.value = '';
            }}
          />

          <p className="mt-3 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('layersLabel')} ({layers.length})
          </p>
          <ul className="space-y-0.5 overflow-y-auto">
            {layers.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">{t('noLayers')}</li>
            )}
            {layers.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(l.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs',
                    selectedId === l.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent',
                  )}
                >
                  {l.type === 'text' ? (
                    <Type className="h-3 w-3 shrink-0" />
                  ) : (
                    <ImageIcon className="h-3 w-3 shrink-0" />
                  )}
                  <span className="truncate">
                    {l.type === 'text' ? l.text : t('imageLayer')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Canvas */}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/30 p-4">
          <div
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="relative shrink-0 select-none overflow-hidden bg-white shadow-[var(--shadow-card-hover)]"
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sourceUrl}
              alt="base"
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
            {layers.map((l) => (
              <DraggableLayer
                key={l.id}
                layer={l}
                selected={selectedId === l.id}
                onSelect={() => setSelectedId(l.id)}
                onMove={(x, y) => update(l.id, { x, y })}
              />
            ))}
          </div>
        </div>

        {/* Right properties */}
        <aside className="flex w-60 shrink-0 flex-col gap-3 border-l bg-card/40 p-3 overflow-y-auto">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('propertiesLabel')}
          </p>
          {!selected ? (
            <p className="text-xs text-muted-foreground">{t('selectLayerHint')}</p>
          ) : selected.type === 'text' ? (
            <TextProps
              layer={selected}
              onChange={(p) => update<TextLayer>(selected.id, p)}
              onDelete={() => deleteLayer(selected.id)}
              t={t}
            />
          ) : (
            <ImageProps
              layer={selected}
              onChange={(p) => update<ImageLayer>(selected.id, p)}
              onDelete={() => deleteLayer(selected.id)}
              t={t}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  onClick,
  label,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function DraggableLayer({
  layer,
  selected,
  onSelect,
  onMove,
}: {
  layer: EditableLayer;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const dragStart = useRef<{ ox: number; oy: number; lx: number; ly: number } | null>(null);

  function onMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect();
    dragStart.current = { ox: e.clientX, oy: e.clientY, lx: layer.x, ly: layer.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragStart.current) return;
      const dx = ev.clientX - dragStart.current.ox;
      const dy = ev.clientY - dragStart.current.oy;
      onMoveCallback(dragStart.current.lx + dx, dragStart.current.ly + dy);
    };
    const onUp = () => {
      dragStart.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // 用最新 onMove (闭包)
  const onMoveCallback = onMove;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: layer.x,
    top: layer.y,
    transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
    opacity: layer.opacity,
    cursor: 'grab',
    // 选中边框 — 紫色实线在白底图上能看见, 跟文字 color 解耦
    outline: selected ? '2px dashed rgb(124 58 237)' : 'none',
    outlineOffset: 4,
  };

  if (layer.type === 'text') {
    return (
      <span
        onMouseDown={onMouseDown}
        style={{
          ...style,
          fontSize: layer.fontSize,
          color: layer.color,
          fontWeight: layer.bold ? 700 : 400,
          whiteSpace: 'pre',
          userSelect: 'none',
        }}
      >
        {layer.text}
      </span>
    );
  }
  return (
    <img
      // eslint-disable-next-line @next/next/no-img-element
      alt="layer"
      src={layer.src}
      draggable={false}
      onMouseDown={onMouseDown}
      style={{
        ...style,
        width: layer.width,
        height: layer.height,
        objectFit: 'contain',
      }}
    />
  );
}

function TextProps({
  layer,
  onChange,
  onDelete,
  t,
}: {
  layer: TextLayer;
  onChange: (p: Partial<TextLayer>) => void;
  onDelete: () => void;
  t: (k: string) => string;
}) {
  return (
    <div className="space-y-3 text-xs">
      <PropField label={t('text')}>
        <textarea
          value={layer.text}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={2}
          className="w-full resize-none rounded-md border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
        />
      </PropField>
      <PropField label={t('fontSize')}>
        <input
          type="number"
          min={8}
          max={200}
          value={layer.fontSize}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          className="w-full rounded-md border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
        />
      </PropField>
      <PropField label={t('color')}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={layer.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="h-7 w-10 cursor-pointer rounded border bg-background"
          />
          <input
            type="text"
            value={layer.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="flex-1 rounded-md border bg-background px-2 py-1 font-mono text-xs focus:border-primary focus:outline-none"
          />
        </div>
      </PropField>
      <PropField label={t('rotation')}>
        <input
          type="range"
          min={-180}
          max={180}
          value={layer.rotation}
          onChange={(e) => onChange({ rotation: Number(e.target.value) })}
          className="w-full"
        />
        <span className="text-[10px] text-muted-foreground tabular-nums">{layer.rotation}°</span>
      </PropField>
      <PropField label={t('opacity')}>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(layer.opacity * 100)}
          onChange={(e) => onChange({ opacity: Number(e.target.value) / 100 })}
          className="w-full"
        />
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {Math.round(layer.opacity * 100)}%
        </span>
      </PropField>
      <button
        type="button"
        onClick={() => onChange({ bold: !layer.bold })}
        className={cn(
          'rounded-md border px-2 py-1 text-xs transition-colors',
          layer.bold
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border hover:border-primary/40',
        )}
      >
        {layer.bold ? t('bold') : t('regular')}
      </button>
      <ResetDelete
        onReset={() => onChange({ rotation: 0, opacity: 1 })}
        onDelete={onDelete}
        t={t}
      />
    </div>
  );
}

function ImageProps({
  layer,
  onChange,
  onDelete,
  t,
}: {
  layer: ImageLayer;
  onChange: (p: Partial<ImageLayer>) => void;
  onDelete: () => void;
  t: (k: string) => string;
}) {
  return (
    <div className="space-y-3 text-xs">
      <PropField label={t('size')}>
        <input
          type="range"
          min={20}
          max={400}
          value={layer.width}
          onChange={(e) => {
            const w = Number(e.target.value);
            const ratio = layer.height / layer.width;
            onChange({ width: w, height: Math.round(w * ratio) });
          }}
          className="w-full"
        />
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {Math.round(layer.width)}×{Math.round(layer.height)}
        </span>
      </PropField>
      <PropField label={t('rotation')}>
        <input
          type="range"
          min={-180}
          max={180}
          value={layer.rotation}
          onChange={(e) => onChange({ rotation: Number(e.target.value) })}
          className="w-full"
        />
        <span className="text-[10px] text-muted-foreground tabular-nums">{layer.rotation}°</span>
      </PropField>
      <PropField label={t('opacity')}>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(layer.opacity * 100)}
          onChange={(e) => onChange({ opacity: Number(e.target.value) / 100 })}
          className="w-full"
        />
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {Math.round(layer.opacity * 100)}%
        </span>
      </PropField>
      <ResetDelete
        onReset={() => onChange({ rotation: 0, opacity: 1 })}
        onDelete={onDelete}
        t={t}
      />
    </div>
  );
}

function PropField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function ResetDelete({
  onReset,
  onDelete,
  t,
}: {
  onReset: () => void;
  onDelete: () => void;
  t: (k: string) => string;
}) {
  return (
    <div className="flex items-center gap-2 border-t pt-2">
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-colors hover:border-primary/40"
      >
        <RotateCcw className="h-3 w-3" />
        {t('reset')}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="ml-auto inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-[10px] text-destructive transition-colors hover:bg-destructive/10"
      >
        <Trash2 className="h-3 w-3" />
        {t('delete')}
      </button>
    </div>
  );
}
