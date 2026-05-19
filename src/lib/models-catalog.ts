/**
 * Static UI metadata for every model the chat surface knows about.
 * Mirrors the bare model_name the abilities table now uses (post
 * M32-2.B-2: same model on multiple channels routes via newapi RR).
 *
 * Job: provide display name, vendor, category, description, vision
 * capability that newapi's flat `/api/user/models` list can't tell us.
 * Once admin starts seeding the newapi `models` table, the
 * `lib/models-meta-source` cache will override description/icon here
 * without a redeploy.
 *
 * Backward compat: old conversations / localStorage may still carry
 * a `__std`/`__foundry`/`__azure` mangled id from before M32-2.B.
 * `resolveModelId()` strips the suffix so the resulting bare name
 * matches the catalog and the abilities table.
 */

export type ModelCategory = 'chat' | 'code' | 'image' | 'video' | 'audio';

export type ModelVendor =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'microsoft'
  | 'meta'
  | 'xai'
  | 'moonshot'
  | 'deepseek'
  | 'azure'
  | 'unknown';

export type ModelEntry = {
  /** ID sent to newapi (matches abilities.model). */
  id: string;
  /** Pretty name shown in the picker. */
  displayName: string;
  vendor: ModelVendor;
  category: ModelCategory;
  /** 60-100 char "what is this good at" summary (Chinese). */
  description: string;
  /** Vision (image input) capability. Used by ChatComposer to show the upload button. */
  vision?: boolean;
  /** M38: 仅 video 类模型 (Veo 系) 填. 各模型实际能力差异大, 用这个驱动 UI. */
  veo?: VeoCapabilities;
};

/**
 * M38 · Veo video model capability matrix. UI 用这个决定:
 * - 时长选择列表 (Veo 3.1 是 4/6/8s, Veo 3.0 是 4/8/16s)
 * - 是否显示首尾帧 (仅 Veo 3.1 支持)
 * - 4K 选项可见性 (lite + 3.0 系不支持 4K)
 * - 实时计费预览 (按选定 resolution × duration 算总价)
 *
 * 数字来自 GA 2026-05 GCP 官方定价 (video+audio). 若 Google 调价, 同步
 * 改 vendor newapi options.ModelRatio + 这里的 pricePerSecond.
 */
export type VeoCapabilities = {
  durations: ReadonlyArray<4 | 6 | 8 | 16>;
  aspects: ReadonlyArray<'16:9' | '9:16'>;
  resolutions: ReadonlyArray<'720p' | '1080p' | '4k'>;
  /** 首尾帧 (lastFrame) 输入支持 — 仅 Veo 3.1 GA 系. */
  supportsLastFrame: boolean;
  /** USD per second (video+audio combined). 4k 缺省时不支持 4K. */
  pricePerSecond: { '720p': number; '1080p': number; '4k'?: number };
};

const CHAT = 'chat' as const;
const CODE = 'code' as const;
const IMAGE = 'image' as const;
const VIDEO = 'video' as const;
const AUDIO = 'audio' as const;

/**
 * Master list. Order in the picker: keep families together (gpt-5.5
 * > 5.4 > pro > mini > nano; claude opus > sonnet > haiku; gemini pro
 *  > flash > image; etc.) so collapsing them by displayName produces
 * a stable sort.
 */
export const MODELS_CATALOG: readonly ModelEntry[] = [
  // —— GPT-5.x family · bare names; newapi RR across all enabled channels ——
  {
    id: 'gpt-5.5',
    displayName: 'GPT-5.5',
    vendor: 'openai',
    category: CHAT,
    description: '人话：五代旗舰级升级款，面向最高质量通用任务。杀手锏：长程推理和工具协作更强。适用：研究综述、复杂编码。',
    vision: true,
  },
  {
    id: 'gpt-5.4',
    displayName: 'GPT-5.4',
    vendor: 'openai',
    category: CHAT,
    description: '人话：五代高阶主力款，适合综合生产任务。杀手锏：推理、写作、工具协作更均衡。适用：商业分析、自动化脚本。',
    vision: true,
  },
  {
    id: 'gpt-5.4-pro',
    displayName: 'GPT-5.4 Pro',
    vendor: 'openai',
    category: CHAT,
    description: '人话：五代专业高端款，偏复杂推理和严肃产出。杀手锏：多约束任务更少漏细节。适用：审计材料、架构评审。',
    vision: true,
  },
  {
    id: 'gpt-5.4-mini',
    displayName: 'GPT-5.4 Mini',
    vendor: 'openai',
    category: CHAT,
    description: '人话：五代轻量主力款，适合低成本部署。杀手锏：响应快，常见任务质量稳定。适用：摘要、客服初答。',
    vision: true,
  },
  {
    id: 'gpt-5.4-nano',
    displayName: 'GPT-5.4 Nano',
    vendor: 'openai',
    category: CHAT,
    description: '人话：五代超轻量款，面向极低成本和低延迟。杀手锏：便宜、快、易批量。适用：意图识别、标签生成。',
  },
  {
    id: 'gpt-5.3-codex',
    displayName: 'GPT-5.3 Codex',
    vendor: 'openai',
    category: CODE,
    description: '人话：五代编程专用款，面向真实代码库。杀手锏：读项目、改文件、跑测试更擅长。适用：代码审查、修复缺陷。',
  },
  {
    id: 'gpt-5.3-chat',
    displayName: 'GPT-5.3 Chat',
    vendor: 'openai',
    category: CHAT,
    description: '人话：五代对话专用款，偏自然交流和助手体验。杀手锏：语气把握好，追问少跑题。适用：客服、写作陪练。',
  },
  {
    id: 'gpt-5.2',
    displayName: 'GPT-5.2',
    vendor: 'openai',
    category: CHAT,
    description: '人话：五代增强主力，面向更复杂的工作流。杀手锏：推理和长任务执行更可靠。适用：数据分析、项目排期。',
  },
  {
    id: 'gpt-5.1',
    displayName: 'GPT-5.1',
    vendor: 'openai',
    category: CHAT,
    description: '人话：生成预训家族五代小升级，主力通用款。杀手锏：回答更稳，工具调用更顺。适用：写方案、处理表格。',
  },

  // —— Claude 4.x family · Channel 1 only ——
  {
    id: 'claude-opus-4-7',
    displayName: 'Claude Opus 4.7',
    vendor: 'anthropic',
    category: CHAT,
    description: '人话：克劳德高端旗舰，偏最高质量输出。杀手锏：复杂约束下更少漏项。适用：法律条款比对、核心代码审查。',
    vision: true,
  },
  {
    id: 'claude-opus-4-6',
    displayName: 'Claude Opus 4.6',
    vendor: 'anthropic',
    category: CHAT,
    description: '人话：克劳德旗舰增强版，适合重型脑力活。杀手锏：多步骤推理和长文保持更稳。适用：读百页资料、排查系统故障。',
    vision: true,
  },
  {
    id: 'claude-opus-4-5-20251101',
    displayName: 'Claude Opus 4.5',
    vendor: 'anthropic',
    category: CHAT,
    description: '人话：克劳德旗舰主力，面向复杂写作和推理。杀手锏：理解细节更准，输出更有章法。适用：论文精读、战略报告。',
    vision: true,
  },
  {
    id: 'claude-opus-4-1-20250805',
    displayName: 'Claude Opus 4.1',
    vendor: 'anthropic',
    category: CHAT,
    description: '人话：克劳德旗舰小升级版，定位高难度思考。杀手锏：比四代更稳，少走偏。适用：代码重构评审、商业尽调。',
    vision: true,
  },
  {
    id: 'claude-opus-4-20250514',
    displayName: 'Claude Opus 4',
    vendor: 'anthropic',
    category: CHAT,
    description: '人话：克劳德前代旗舰，偏深度推理和复杂任务。杀手锏：长链路分析扎实。适用：合同审阅、产品方案拆解。',
    vision: true,
  },
  {
    id: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    vendor: 'anthropic',
    category: CHAT,
    description: '人话：克劳德主力增强版，偏稳定交付。杀手锏：长上下文里抓重点更牢。适用：读项目资料、整理调研结论。',
    vision: true,
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    displayName: 'Claude Sonnet 4.5',
    vendor: 'anthropic',
    category: CHAT,
    description: '人话：克劳德主力升级款，适合高频生产。杀手锏：速度和质量平衡好，中文表达自然。适用：会议纪要、代码解释。',
    vision: true,
  },
  {
    id: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet 4',
    vendor: 'anthropic',
    category: CHAT,
    description: '人话：克劳德主力均衡款，兼顾质量和成本。杀手锏：写作、分析、代码都不偏科。适用：公众号文章、需求文档。',
    vision: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku 4.5',
    vendor: 'anthropic',
    category: CHAT,
    description: '人话：克劳德家族轻量快模，主打日常问答。杀手锏：响应快、成本低，理解长对话稳。适用：客服初筛、批量改短文。',
    vision: true,
  },

  // —— Gemini family · Channel 4 (GCP Vertex) ——
  {
    id: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    vendor: 'google',
    category: CHAT,
    description: '人话：双子高端专业款，面向复杂推理和长资料。杀手锏：长上下文与多模态理解突出。适用：读长报告、分析表格截图。',
    vision: true,
  },
  {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    vendor: 'google',
    category: CHAT,
    description: '人话：双子家族快速主力款，适合日常多模态。杀手锏：速度快，上下文处理能力好。适用：网页摘要、图文问答。',
    vision: true,
  },
  {
    id: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash Lite',
    vendor: 'google',
    category: CHAT,
    description: '人话：双子轻量低价款，适合简单任务。杀手锏：响应快、成本低，批量处理划算。适用：文本分类、短句润色。',
    vision: true,
  },
  {
    id: 'gemini-3-flash-preview',
    displayName: 'Gemini 3 Flash',
    vendor: 'google',
    category: CHAT,
    description: '人话：双子三代快速款，偏新一代高吞吐。杀手锏：在速度下保持较好推理。适用：实时问答、批量摘要。',
    vision: true,
  },
  {
    id: 'gemini-3.1-pro-preview',
    displayName: 'Gemini 3.1 Pro',
    vendor: 'google',
    category: CHAT,
    description: '人话：双子三代旗舰预览版，面向最复杂的脑力活。杀手锏：百万级上下文 + 多模态原生 + 深度推理。适用：大型代码改造、研究综述、多步代理工作流。',
    vision: true,
  },
  {
    id: 'gemini-3.1-flash-lite-preview',
    displayName: 'Gemini 3.1 Flash Lite',
    vendor: 'google',
    category: CHAT,
    description: '人话：双子三代轻量预览版，面向高容量业务。杀手锏：更快首字响应 + 低价 + 可选思考档位。适用：内容审核、海量翻译、代码库检索、实时后台自动化。',
    vision: true,
  },
  {
    id: 'gemini-2.5-flash-lite-preview-09-2025',
    displayName: 'Gemini 2.5 Flash Lite (09-2025)',
    vendor: 'google',
    category: CHAT,
    description: '人话：双子轻量预览版，定位低延迟低成本入口。杀手锏：可调思考 + 百万上下文 + 文本图像音视频全输入。适用：批量翻译、分类、客服分流、图片音频理解。',
    vision: true,
  },

  // —— DeepSeek · Channel 2 (Foundry) ——
  {
    id: 'DeepSeek-V3.1',
    displayName: 'DeepSeek V3.1',
    vendor: 'deepseek',
    category: CHAT,
    description: '人话：深度求索主力通用款，性价比取向。杀手锏：中文、代码和数学题成本友好。适用：脚本生成、学习辅导。',
  },
  {
    id: 'DeepSeek-V3.2',
    displayName: 'DeepSeek V3.2',
    vendor: 'deepseek',
    category: CHAT,
    description: '人话：深度求索通用升级款，适合批量调用。杀手锏：推理更稳，价格仍有优势。适用：知识库问答、代码补全。',
  },
  {
    id: 'DeepSeek-V4-Flash',
    displayName: 'DeepSeek V4 Flash',
    vendor: 'deepseek',
    category: CHAT,
    description: '人话：国产编程王 V4 闪电款，跑分对齐 GPT-5.4 但价格 1/10。杀手锏：代码补全、长函数生成、低延迟批量调用。适用：技术翻译、客服回复、标题生成、批量代码改写。',
  },

  // —— Grok · Channel 2 ——
  {
    id: 'grok-4-20-reasoning',
    displayName: 'Grok 4.20 Reasoning',
    vendor: 'xai',
    category: CHAT,
    description: '人话：格罗克推理增强款，适合需要慢思考的题。杀手锏：步骤拆解更细，结论更可查。适用：数学题、策略推演。',
    vision: true,
  },
  {
    id: 'grok-4-20-non-reasoning',
    displayName: 'Grok 4.20',
    vendor: 'xai',
    category: CHAT,
    description: '人话：xAI 主力实时款，吃 X / Twitter 数据。杀手锏：实时热点跟得最快，敢说人话不绕弯。适用：舆情摘要、社媒文案、辩论对线、新闻总结。',
    vision: true,
  },

  // —— Kimi · Channel 2 ——
  {
    id: 'Kimi-K2.6',
    displayName: 'Kimi K2.6',
    vendor: 'moonshot',
    category: CHAT,
    description: '人话：月之暗面长文升级款，面向更复杂中文工作。杀手锏：长文记忆更稳，中文总结更顺。适用：研报精读、知识库问答。',
    vision: true,
  },
  {
    id: 'Kimi-K2.5',
    displayName: 'Kimi K2.5',
    vendor: 'moonshot',
    category: CHAT,
    description: '人话：月之暗面长文主力款，擅长中文资料处理。杀手锏：长上下文和阅读理解突出。适用：读合同、整理访谈。',
    vision: true,
  },

  // —— Mistral / Phi · Channel 2 ——
  {
    id: 'Mistral-Large-3',
    displayName: 'Mistral Large 3',
    vendor: 'mistral',
    category: CHAT,
    description: '人话：米斯特拉尔大模型旗舰款，偏企业通用和多语种。杀手锏：欧洲语种与私有部署友好。适用：跨境客服、内部助手。',
  },
  {
    id: 'Phi-4',
    displayName: 'Phi-4',
    vendor: 'microsoft',
    category: CHAT,
    description: '人话：小参数高效率模型，适合本地和边缘场景。杀手锏：体积小，数学和代码表现不错。适用：离线问答、课堂练习。',
  },

  // —— Image generation ——
  {
    id: 'gpt-image-2',
    displayName: 'GPT Image 2',
    vendor: 'openai',
    category: IMAGE,
    description: '人话：开放人工智能图像生成款，专做出图和改图。杀手锏：文字排版、局部编辑更可控。适用：海报、产品场景图。',
  },
  {
    id: 'gemini-2.5-flash-image',
    displayName: 'Nano Banana',
    vendor: 'google',
    category: IMAGE,
    description: '人话：中文海报神器（俗称 Nano Banana），多帧一致性强。杀手锏：中文字保留好 + 同人物多角度 + 价格只要 GPT Image 的 1/3。适用：电商主图、漫画分镜、中文 Banner、多视角产品图。',
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    displayName: 'Gemini 3.1 Flash Image',
    vendor: 'google',
    category: IMAGE,
    description: '人话：双子快速图像升级款，适合频繁出图。杀手锏：速度快，图文指令跟随更稳。适用：电商配图、社媒封面。',
  },
  {
    id: 'gemini-3-pro-image-preview',
    displayName: 'Gemini 3 Pro Image',
    vendor: 'google',
    category: IMAGE,
    description: '人话：双子三代专业图像款，偏高质量视觉。杀手锏：图像细节控制和理解更强。适用：广告主视觉、设计稿评审。',
  },

  // —— Video generation ——
  {
    id: 'veo-3.1-generate-001',
    displayName: 'Veo 3.1',
    vendor: 'google',
    category: VIDEO,
    description: '人话：谷歌视频旗舰 GA 款，最新一代。杀手锏：支持首尾帧 + 4K 输出 + 4/6/8s 时长可选。适用：高品质宣传片、故事短片。',
    veo: {
      durations: [4, 6, 8],
      aspects: ['16:9', '9:16'],
      resolutions: ['720p', '1080p', '4k'],
      supportsLastFrame: true,
      pricePerSecond: { '720p': 0.4, '1080p': 0.4, '4k': 0.6 },
    },
  },
  {
    id: 'veo-3.1-fast-generate-001',
    displayName: 'Veo 3.1 Fast',
    vendor: 'google',
    category: VIDEO,
    description: '人话：Veo 3.1 快速版 GA，性价比最高。杀手锏：720p 仅 $0.10/s，多轮试稿不肉疼。适用：电商短视频、社媒素材。',
    veo: {
      durations: [4, 6, 8],
      aspects: ['16:9', '9:16'],
      resolutions: ['720p', '1080p', '4k'],
      supportsLastFrame: true,
      pricePerSecond: { '720p': 0.1, '1080p': 0.12, '4k': 0.3 },
    },
  },
  {
    id: 'veo-3.1-lite-generate-001',
    displayName: 'Veo 3.1 Lite',
    vendor: 'google',
    category: VIDEO,
    description: '人话：Veo 3.1 轻量 preview 版，最便宜。杀手锏：720p $0.05/s，做缩略图/分镜测试爽快。适用：草稿、批量预览。',
    veo: {
      durations: [4, 6, 8],
      aspects: ['16:9', '9:16'],
      resolutions: ['720p', '1080p'],
      supportsLastFrame: true,
      pricePerSecond: { '720p': 0.05, '1080p': 0.08 },
    },
  },
  {
    id: 'veo-3.0-generate-001',
    displayName: 'Veo 3.0',
    vendor: 'google',
    category: VIDEO,
    description: '人话：谷歌视频生成上代旗舰款。杀手锏：动作、光影和镜头连续性更好。适用：宣传片、故事短片。',
    veo: {
      durations: [4, 8, 16],
      aspects: ['16:9', '9:16'],
      resolutions: ['720p', '1080p'],
      supportsLastFrame: false,
      pricePerSecond: { '720p': 0.4, '1080p': 0.6 },
    },
  },
  {
    id: 'veo-3.0-fast-generate-001',
    displayName: 'Veo 3.0 Fast',
    vendor: 'google',
    category: VIDEO,
    description: '人话：Veo 3.0 快速版，适合高频试片。杀手锏：生成更快，便于多轮改稿。适用：广告草稿、短视频素材。',
    veo: {
      durations: [4, 8, 16],
      aspects: ['16:9', '9:16'],
      resolutions: ['720p', '1080p'],
      supportsLastFrame: false,
      pricePerSecond: { '720p': 0.15, '1080p': 0.4 },
    },
  },
  {
    id: 'veo-2.0-generate-001',
    displayName: 'Veo 2.0',
    vendor: 'google',
    category: VIDEO,
    description: '人话：谷歌视频生成前代主力，专做文生视频。杀手锏：画面稳定，镜头感较好。适用：短广告、分镜预览。',
    veo: {
      durations: [4, 8, 16],
      aspects: ['16:9', '9:16'],
      resolutions: ['720p'],
      supportsLastFrame: false,
      pricePerSecond: { '720p': 0.5, '1080p': 0.5 },
    },
  },

  // —— Audio · Not in chat picker (TTS handled by SpeakButton) ——
  {
    id: 'gpt-4o-mini-tts',
    displayName: 'GPT-4o Mini TTS',
    vendor: 'openai',
    category: AUDIO,
    description: '人话：小型语音合成款，专门把文字读成声音。杀手锏：成本低、延迟短，音色自然。适用：有声文章、客服播报。',
  },
];

const ENTRY_BY_ID = new Map<string, ModelEntry>(
  MODELS_CATALOG.map((e) => [e.id, e]),
);

/** Look up a catalog entry by its bare id. */
export function findModelEntry(id: string): ModelEntry | undefined {
  return ENTRY_BY_ID.get(id);
}

/** First variant of a group (length is always 1 post M32-2.B). */
export function defaultVariantOf(group: GroupedModel): ModelEntry {
  return group.variants[0];
}

/**
 * Normalise a model id read from old DB rows / localStorage.
 * Strips any `__suffix` (legacy mangle from the M29-B era) so the
 * resulting bare id matches both the catalog and the post-migration
 * abilities table. Unknown ids pass through unchanged.
 */
export function resolveModelId(id: string | null | undefined): string {
  if (!id) return '';
  return stripChannelSuffix(id);
}

export type GroupedModel = {
  displayName: string;
  vendor: ModelVendor;
  category: ModelCategory;
  description: string;
  /**
   * Always length 1 post M32-2.B — kept as an array purely so existing
   * callers (ModelLibrary, CollaborationModal) need no shape change.
   */
  variants: ModelEntry[];
};

/**
 * Group available IDs (from newapi `/api/user/models`) into picker-
 * friendly buckets keyed by displayName. Post M32-2.B-3 each id maps
 * to a unique displayName so groups always have variants.length === 1
 * — the array shape is preserved purely so existing callers don't need
 * to change.
 *
 * Unknown IDs (not in catalog) appear as a synthesised entry — better
 * to show "GPT-7" with a generic monogram than to swallow it.
 */
export function groupByDisplayName(availableIds: readonly string[]): GroupedModel[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const groups = new Map<string, GroupedModel>();
  for (const id of availableIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = ENTRY_BY_ID.get(id) ?? synthesiseUnknown(id);
    const key = entry.displayName;
    if (!groups.has(key)) {
      order.push(key);
      groups.set(key, {
        displayName: entry.displayName,
        vendor: entry.vendor,
        category: entry.category,
        description: entry.description,
        variants: [],
      });
    }
    groups.get(key)!.variants.push(entry);
  }
  return order.map((k) => groups.get(k)!);
}

/**
 * Strip a `__hint` suffix when computing vendor monograms or other
 * "what does this name look like" derivations from the bare name.
 */
export function stripChannelSuffix(id: string): string {
  const i = id.indexOf('__');
  return i === -1 ? id : id.slice(0, i);
}

function synthesiseUnknown(id: string): ModelEntry {
  return {
    id,
    displayName: id,
    vendor: 'unknown',
    category: CHAT,
    description: '',
  };
}

/**
 * M38 helper: lookup Veo capability matrix for a video model id. Returns
 * null for non-Veo / unknown models. UI driven by this — durations / aspects
 * / resolutions / lastFrame / pricing all flow through.
 */
export function veoCapabilities(id: string): VeoCapabilities | null {
  const m = findModelEntry(id);
  return m?.veo ?? null;
}
