export { StateBanner, STATE_ICONS, type StateBannerProps, type BannerSize } from './StateBanner';
export { RiskMeter, riskColor, TACTIC_META, type RiskMeterProps } from './RiskMeter';
export { Transcript, type TranscriptProps } from './Transcript';
export { CallerCard, formatPhone, type CallerCardProps } from './CallerCard';
export { LampGlow, type LampGlowProps, type LampSize } from './LampGlow';
export { OutcomeBadge, type OutcomeBadgeProps } from './OutcomeBadge';
export { ReadyState, type ReadyStateProps } from './ReadyState';
export {
  OperatorBar,
  type OperatorBarProps,
  type OperatorStatus,
  type OperatorAction,
} from './OperatorBar';
export { StatusDot, type StatusDotProps, type StatusTone } from './StatusDot';
export { useOperatorVisible, OPERATOR_STORAGE_KEY } from './useOperatorVisible';
export {
  useOperatorController,
  useBridgeStatus,
  getDemoToken,
  DEMO_TOKEN_STORAGE_KEY,
  LAMP_TEST_EVENT,
  type OperatorController,
} from './useOperatorController';
export {
  deriveStageState,
  deriveFreshStageState,
  lastActivity,
  isStaleLive,
  isAbandonedLive,
  isSupersededLive,
  STALE_LIVE_MS,
  stateVisual,
  stateKey,
  STATE_VISUALS,
  RESULT_HOLD_MS,
  isLiveCall,
  isTerminalCall,
  terminalAt,
  type StageCallLike,
  type StateKey,
  type StateVisual,
  type StageMode,
  type StageState,
} from '@/lib/stageState';
export { LineStatusPill, useLineStatus, formatElapsed, type LineStatus } from './LineStatus';
