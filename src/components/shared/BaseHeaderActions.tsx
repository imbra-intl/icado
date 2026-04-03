import type { RefObject } from 'react';
import { GitBranch, Github, Expand, Loader2, Lock, Unlock } from 'lucide-react';
import { ModelConfigInfo } from '@/components/shared/ModelConfigInfo';
import { HeaderButton } from '@/components/shared/header-actions';
import type { ModelConfigsInfo } from '@/api-types';

export interface BaseHeaderActionsProps {
	containerRef: RefObject<HTMLElement | null>;
	modelConfigs?: ModelConfigsInfo;
	onRequestConfigs: () => void;
	loadingConfigs: boolean;
	onGitCloneClick: () => void;
	isGitHubExportReady: boolean;
	onGitHubExportClick: () => void;
	showModelInfo?: boolean;
	visibility?: 'private' | 'team' | 'board' | 'public';
	canToggleVisibility?: boolean;
	isUpdatingVisibility?: boolean;
	onToggleVisibility?: () => void;
}

export function BaseHeaderActions({
	containerRef,
	modelConfigs,
	onRequestConfigs,
	loadingConfigs,
	onGitCloneClick,
	isGitHubExportReady,
	onGitHubExportClick,
	showModelInfo = true,
	visibility,
	canToggleVisibility = false,
	isUpdatingVisibility = false,
	onToggleVisibility,
}: BaseHeaderActionsProps) {
	const shouldShowVisibilityToggle =
		canToggleVisibility && !!visibility && typeof onToggleVisibility === 'function';
	const visibilityLabel =
		visibility === 'private' ? 'Make Public' : 'Make Private';
	const visibilityTitle =
		visibility === 'private' ? 'Make this project public' : 'Make this project private';

	return (
		<>
			{showModelInfo && (
				<ModelConfigInfo
					configs={modelConfigs}
					onRequestConfigs={onRequestConfigs}
					loading={loadingConfigs}
				/>
			)}
			{shouldShowVisibilityToggle && (
				<button
					className="group relative flex items-center gap-1.5 p-1.5 group-hover:pl-2 group-hover:pr-2.5 rounded-full group-hover:rounded-md transition-all duration-300 ease-in-out hover:bg-bg-4 border border-transparent hover:border-border-primary hover:shadow-sm overflow-hidden disabled:cursor-not-allowed disabled:opacity-60"
					onClick={() => onToggleVisibility?.()}
					title={visibilityTitle}
					type="button"
					disabled={isUpdatingVisibility}
				>
					{isUpdatingVisibility ? (
						<Loader2 className="size-3.5 animate-spin text-text-primary/60 transition-colors duration-300 flex-shrink-0" />
					) : visibility === 'private' ? (
						<Unlock className="size-3.5 text-text-primary/60 group-hover:text-brand-primary transition-colors duration-300 flex-shrink-0" />
					) : (
						<Lock className="size-3.5 text-text-primary/60 group-hover:text-brand-primary transition-colors duration-300 flex-shrink-0" />
					)}
					<span className="max-w-0 group-hover:max-w-[95px] opacity-0 group-hover:opacity-100 overflow-hidden transition-all duration-300 ease-in-out whitespace-nowrap text-xs font-medium text-text-primary">
						{isUpdatingVisibility ? 'Updating' : visibilityLabel}
					</span>
				</button>
			)}
			<HeaderButton
				icon={GitBranch}
				label="Clone"
				onClick={onGitCloneClick}
				title="Clone to local machine"
			/>
			{isGitHubExportReady && (
				<HeaderButton
					icon={Github}
					label="GitHub"
					onClick={onGitHubExportClick}
					title="Export to GitHub"
				/>
			)}
			<HeaderButton
				icon={Expand}
				onClick={() => containerRef.current?.requestFullscreen()}
				title="Fullscreen"
				iconOnly
			/>
		</>
	);
}
