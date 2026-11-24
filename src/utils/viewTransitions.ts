import type { Variants } from 'motion/react';
import type { AppView } from '../context/AppContext';

export type ViewNavigationDirection = -1 | 0 | 1;
export type ViewTransitionKind = 'stack' | 'modal_up' | 'tab' | 'fade';

export interface ViewTransitionContext {
  direction: ViewNavigationDirection;
  kind: ViewTransitionKind;
  reducedMotion: boolean;
}

/**
 * Native deceleration curve (fast initial response, crisp settle <= 220ms).
 */
export const NATIVE_TRANSITION_EASE = [0.16, 1, 0.3, 1] as const;

export const VIEW_TRANSITION_DURATION_ENTER = 0.2;
export const VIEW_TRANSITION_DURATION_EXIT = 0.13;

/**
 * Logical depth & peer order for mobile native push/pop transitions.
 */
export const VIEW_NAVIGATION_DEPTH: Readonly<Record<AppView, number>> = {
  landing: 0,
  login_vendeur: 1,
  login_livreur: 1,
  register: 1,
  vendeur_dashboard: 2,
  livreur_dashboard: 2,
  admin_console: 2,
  vendeur_tracking: 3,
  vendeur_reports: 3,
  vendeur_chat: 3,
  vendeur_settings: 3,
  vendeur_new_delivery: 4,
  livreur_missions: 3,
  livreur_wallet: 3,
  livreur_chat: 3,
  livreur_settings: 3,
  not_found: 1,
};

const LATERAL_TAB_ORDER: Readonly<Partial<Record<AppView, number>>> = {
  vendeur_dashboard: 0,
  vendeur_tracking: 1,
  vendeur_new_delivery: 2,
  vendeur_chat: 3,
  vendeur_reports: 4,
  vendeur_settings: 5,
  livreur_dashboard: 0,
  livreur_missions: 1,
  livreur_wallet: 2,
  livreur_chat: 3,
  livreur_settings: 4,
};

export function getViewNavigationDirection(
  prevView: AppView | null,
  nextView: AppView
): ViewNavigationDirection {
  if (!prevView || prevView === nextView) return 0;

  const prevDepth = VIEW_NAVIGATION_DEPTH[prevView] ?? 1;
  const nextDepth = VIEW_NAVIGATION_DEPTH[nextView] ?? 1;

  if (nextDepth > prevDepth) return 1;
  if (nextDepth < prevDepth) return -1;

  const prevTab = LATERAL_TAB_ORDER[prevView];
  const nextTab = LATERAL_TAB_ORDER[nextView];
  if (prevTab !== undefined && nextTab !== undefined && prevTab !== nextTab) {
    return nextTab > prevTab ? 1 : -1;
  }

  return 0;
}

export function getViewTransitionKind(
  prevView: AppView | null,
  nextView: AppView
): ViewTransitionKind {
  if (!prevView || prevView === nextView) return 'fade';

  if (nextView === 'vendeur_new_delivery') {
    return 'modal_up';
  }

  const prevTab = LATERAL_TAB_ORDER[prevView];
  const nextTab = LATERAL_TAB_ORDER[nextView];
  if (prevTab !== undefined && nextTab !== undefined && prevView.split('_')[0] === nextView.split('_')[0]) {
    return 'tab';
  }

  const prevDepth = VIEW_NAVIGATION_DEPTH[prevView] ?? 1;
  const nextDepth = VIEW_NAVIGATION_DEPTH[nextView] ?? 1;
  if (prevDepth !== nextDepth) {
    return 'stack';
  }

  return 'fade';
}

export function computeViewTransitionContext(
  prevView: AppView | null,
  nextView: AppView,
  reducedMotion = false
): ViewTransitionContext {
  return {
    direction: getViewNavigationDirection(prevView, nextView),
    kind: getViewTransitionKind(prevView, nextView),
    reducedMotion,
  };
}

/**
 * Compositor-only Framer Motion variants (`transform` + `opacity` only)
 * tailored for native mobile screen feel while keeping `prefers-reduced-motion` instant.
 */
export const MAIN_ROUTER_VIEW_VARIANTS: Variants = {
  initial: (ctx?: ViewTransitionContext) => {
    if (!ctx || ctx.reducedMotion) {
      return { opacity: 0, x: 0, y: 0 };
    }
    if (ctx.kind === 'modal_up') {
      return { opacity: 0, x: 0, y: 20 };
    }
    if (ctx.kind === 'stack' || ctx.kind === 'tab') {
      const offset = ctx.direction >= 0 ? 18 : -18;
      return { opacity: 0, x: ctx.direction === 0 ? 0 : offset, y: ctx.direction === 0 ? 6 : 0 };
    }
    return { opacity: 0, x: 0, y: 6 };
  },
  animate: (ctx?: ViewTransitionContext) => ({
    opacity: 1,
    x: 0,
    y: 0,
    transition: ctx?.reducedMotion
      ? { duration: 0.1 }
      : {
          duration: VIEW_TRANSITION_DURATION_ENTER,
          ease: NATIVE_TRANSITION_EASE,
        },
  }),
  exit: (ctx?: ViewTransitionContext) => {
    if (!ctx || ctx.reducedMotion) {
      return {
        opacity: 0,
        x: 0,
        y: 0,
        transition: { duration: 0.08 },
      };
    }
    if (ctx.kind === 'modal_up') {
      return {
        opacity: 0,
        x: 0,
        y: -10,
        transition: { duration: VIEW_TRANSITION_DURATION_EXIT, ease: NATIVE_TRANSITION_EASE },
      };
    }
    if (ctx.kind === 'stack' || ctx.kind === 'tab') {
      const offset = ctx.direction >= 0 ? -12 : 12;
      return {
        opacity: 0,
        x: ctx.direction === 0 ? 0 : offset,
        y: 0,
        transition: { duration: VIEW_TRANSITION_DURATION_EXIT, ease: NATIVE_TRANSITION_EASE },
      };
    }
    return {
      opacity: 0,
      x: 0,
      y: -4,
      transition: { duration: VIEW_TRANSITION_DURATION_EXIT, ease: NATIVE_TRANSITION_EASE },
    };
  },
};
