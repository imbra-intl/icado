import { BaseHeaderActions } from '@/components/shared/BaseHeaderActions';
import type { HeaderActionsProps } from '../../core/types';

export function AppHeaderActions({
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
}: HeaderActionsProps) {
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
