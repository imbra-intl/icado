import type { RefObject } from 'react';
import { BaseHeaderActions } from '@/components/shared/BaseHeaderActions';
import type { ModelConfigsInfo } from '@/api-types';

interface EditorHeaderActionsProps {
	modelConfigs?: ModelConfigsInfo;
	onRequestConfigs: () => void;
	loadingConfigs: boolean;
	onGitCloneClick: () => void;
	isGitHubExportReady: boolean;
	onGitHubExportClick: () => void;
	editorRef: RefObject<HTMLDivElement | null>;
	visibility?: 'private' | 'team' | 'board' | 'public';
	canToggleVisibility?: boolean;
	isUpdatingVisibility?: boolean;
	onToggleVisibility?: () => void;
}

export function EditorHeaderActions({
	modelConfigs,
	onRequestConfigs,
	loadingConfigs,
	onGitCloneClick,
	isGitHubExportReady,
	onGitHubExportClick,
	editorRef,
	visibility,
	canToggleVisibility,
	isUpdatingVisibility,
	onToggleVisibility,
}: EditorHeaderActionsProps) {
	return (
		<BaseHeaderActions
			containerRef={editorRef}
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
