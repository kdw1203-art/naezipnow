/* [992] UI 킷 정리 — Card·CardSection·Badge·SectionHeader·SourceNote·ChipRow·WaveLoader·
   BarLoader 는 사용처 0 이었다(실제 버튼은 globals.css .btn-* 542곳, 카드는 .card 668곳,
   칩은 .chip* 480곳). 쓰이지 않는 추상을 index 에서 내보내면 "이걸 써야 하나" 하는 비용만
   남는다. 남은 것: EmptyState/ErrorState(채택된 유일한 원시)와 그 안의 Button,
   Chip(ScenarioClient 3곳), Modal, Segmented, Skeleton(Sk*). */
export { Button } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";

export { Chip } from "./Chip";
export type { ChipProps, ChipTone } from "./Chip";

export { EmptyState, ErrorState } from "./EmptyState";
export type {
  EmptyStateProps,
  EmptyStateAction,
  ErrorStateProps,
  StateTone,
} from "./EmptyState";

export { Modal, ModalHeader } from "./Modal";
export type { ModalProps } from "./Modal";

export { Segmented } from "./Segmented";

export { SkLine, SkBlock, SkCard, SkTable } from "./Skeleton";
