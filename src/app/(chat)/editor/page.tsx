import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ImageEditor } from '@/components/editor/ImageEditor';

/**
 * M37 · /editor 单图 P 图编辑器.
 *
 * 入口: ?image=<url> — 从 StepDone 大图旁「打开 P 图」按钮 / StepResultsV2
 * 候选 hover 上「编辑」按钮过来. 用户在这里加文字/logo/水印/调比例/导出.
 *
 * 实现方式: HTML + CSS 绝对定位层 + html-to-image 导出 (而非 Konva).
 * 选这条路是因为 V1 功能简单 (文字/logo/水印 + 拖拽 + 旋转 + 下载),
 * HTML 比 canvas 路径少 ~400 LOC, debug 更直观, 字体渲染走浏览器原生.
 *
 * Punt 到 M38: AI 抠图 / 撤销栈 / 局部 mask 编辑 / 多图协作.
 */
export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<{ image?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/sign-in' as never);
  const sp = await searchParams;
  const image = sp.image ?? '';
  if (!image) redirect('/welcome' as never);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background">
      <ImageEditor sourceUrl={image} />
    </div>
  );
}
