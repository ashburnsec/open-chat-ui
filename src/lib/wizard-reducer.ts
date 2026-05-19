import type { WizardAction, WizardState } from './wizard-types';

/**
 * M36 wizard state reducer. 每次 advance() 拿到 server 响应后 dispatch
 * 一个 action 推进 state. metadata 整段直接来自 server (单一真相源),
 * 客户端只 mutate 派生字段.
 */
export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_BRIEF':
      return {
        ...state,
        userBrief: action.brief,
        refImageUrl: action.refImageUrl,
        metadata: {
          ...state.metadata,
          user_brief: action.brief,
          ref_image_url: action.refImageUrl ?? undefined,
        },
      };
    case 'SET_DIRECTIONS':
      return {
        ...state,
        directions: action.directions,
        metadata: action.metadata,
      };
    case 'SET_PROMPTS':
      return {
        ...state,
        prompts: action.prompts,
        promptsBilingual: action.promptsBilingual,
        selectedDirection: action.selectedDirection,
        selectedDirectionIdx: action.selectedDirectionIdx,
        metadata: action.metadata,
      };
    case 'PUSH_ITERATION': {
      const existing = state.iterations.find((i) => i.iteration === action.iteration.iteration);
      const next = existing
        ? state.iterations.map((i) =>
            i.iteration === action.iteration.iteration ? action.iteration : i,
          )
        : [...state.iterations, action.iteration];
      next.sort((a, b) => a.iteration - b.iteration);
      return { ...state, iterations: next, metadata: action.metadata };
    }
    case 'SET_DONE':
      return {
        ...state,
        finalUrl: action.finalUrl,
        finalIteration: action.finalIteration,
        metadata: action.metadata,
      };
    case 'GOTO_STEP':
      return { ...state, metadata: { ...state.metadata, step: action.step } };
    case 'SET_STORYBOARD_PROMPT':
      return {
        ...state,
        storyboardPromptZh: action.zh,
        storyboardPromptEn: action.en,
        metadata: action.metadata,
      };
    case 'SET_VIDEO_PLAN':
      return {
        ...state,
        videoPlan: action.videoPlan,
        metadata: action.metadata,
      };
    case 'PUSH_VIDEO_SEGMENT': {
      const existing = state.videoSegments ?? [];
      const idx = existing.findIndex((s) => s.seq === action.segment.seq);
      const next =
        idx >= 0
          ? existing.map((s) => (s.seq === action.segment.seq ? action.segment : s))
          : [...existing, action.segment];
      next.sort((a, b) => a.seq - b.seq);
      return { ...state, videoSegments: next, metadata: action.metadata };
    }
    case 'PATCH_VIDEO_SEGMENT_TASK': {
      const existing = state.videoSegments ?? [];
      const next = existing.map((s) =>
        s.seq === action.seq ? { ...s, videoTask: action.videoTask } : s,
      );
      return { ...state, videoSegments: next };
    }
    default:
      return state;
  }
}
