import type { RefObject } from 'react';
import { BaseHeaderActions } from '@/components/shared/BaseHeaderActions';
import type { ModelConfigsInfo } from '@/api-types';

interface PreviewHeaderActionsProps {
	modelConfigs?: ModelConfigsInfo;
	onRequestConfigs: () => void;
	loadingConfigs: boolean;
	onGitCloneClick: () => void;
	isGitHubExportReady: boolean;
	onGitHubExportClick: () => void;
	previewRef: RefObject<HTMLIFrameElement | null>;
	visibility?: 'private' | 'team' | 'board' | 'public';
	canToggleVisibility?: boolean;
	isUpdatingVisibility?: boolean;
	onToggleVisibility?: () => void;
}

export function PreviewHeaderActions({
	modelConfigs,
	onRequestConfigs,
	loadingConfigs,
	onGitCloneClick,
	isGitHubExportReady,
	onGitHubExportClick,
	previewRef,
	visibility,
	canToggleVisibility,
	isUpdatingVisibility,
	onToggleVisibility,
}: PreviewHeaderActionsProps) {
	return (
		<BaseHeaderActions
			containerRef={previewRef}
			modelConfigs={modelConfigs}
			onRequestConfigs={onRequestConfigs}
			loadingConfigs={loadingConfigs}
			onGitCloneClick={onGitCloneClick}
			isGitHubExportReady={isGitHubExportReady}
			onGitHubExportClick={onGitHubExportClick}
			showModelInfo={false}
			visibility={visibility}
			canToggleVisibility={canToggleVisibility}
			isUpdatingVisibility={isUpdatingVisibility}
			onToggleVisibility={onToggleVisibility}
		/>
	);
}
