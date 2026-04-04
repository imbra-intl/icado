import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Info } from 'react-feather';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useFeature } from '@/features';
import { apiClient } from '@/lib/api-client';
import { ProjectModeSelector, type ProjectModeOption } from '@/components/project-mode-selector';
import {
	MAX_AGENT_QUERY_LENGTH,
	SUPPORTED_IMAGE_MIME_TYPES,
	type ProjectType,
} from '@/api-types';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useDragDrop } from '@/hooks/use-drag-drop';
import { ImageUploadButton } from '@/components/image-upload-button';
import { ImageAttachmentPreview } from '@/components/image-attachment-preview';
import clsx from 'clsx';

export function CreateProjectPanel() {
	const navigate = useNavigate();
	const { requireAuth } = useAuthGuard();
	const { isLoadingCapabilities, capabilities, getEnabledFeatures } = useFeature();

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [projectMode, setProjectMode] = useState<ProjectType>('app');
	const [query, setQuery] = useState('');
	const [currentPlaceholderPhraseIndex, setCurrentPlaceholderPhraseIndex] = useState(0);
	const [currentPlaceholderText, setCurrentPlaceholderText] = useState('');
	const [isPlaceholderTyping, setIsPlaceholderTyping] = useState(true);
	const [isValidatingCredits, setIsValidatingCredits] = useState(false);

	const modeOptions = useMemo<ProjectModeOption[]>(() => {
		if (isLoadingCapabilities || !capabilities) return [];
		return getEnabledFeatures().map((def) => ({
			id: def.id,
			label:
				def.id === 'presentation'
					? 'Slides'
					: def.id === 'general'
						? 'General'
						: 'App',
			description: def.description,
		}));
	}, [capabilities, getEnabledFeatures, isLoadingCapabilities]);

	const showModeSelector = modeOptions.length > 1;

	useEffect(() => {
		if (isLoadingCapabilities) return;
		if (modeOptions.length === 0) {
			if (projectMode !== 'app') setProjectMode('app');
			return;
		}
		if (!modeOptions.some((m) => m.id === projectMode)) {
			setProjectMode(modeOptions[0].id);
		}
	}, [isLoadingCapabilities, modeOptions, projectMode]);

	const { images, addImages, removeImage, clearImages, isProcessing } = useImageUpload({
		onError: (error) => {
			console.error('Image upload error:', error);
			toast.error(error);
		},
	});

	const { isDragging, dragHandlers } = useDragDrop({
		onFilesDropped: addImages,
		accept: [...SUPPORTED_IMAGE_MIME_TYPES],
	});

	const placeholderPhrases = useMemo(
		() => ['todo list app', 'F1 fantasy game', 'personal finance tracker'],
		[],
	);

	useEffect(() => {
		const currentPhrase = placeholderPhrases[currentPlaceholderPhraseIndex];

		if (isPlaceholderTyping) {
			if (currentPlaceholderText.length < currentPhrase.length) {
				const timeout = setTimeout(() => {
					setCurrentPlaceholderText(
						currentPhrase.slice(0, currentPlaceholderText.length + 1),
					);
				}, 100);
				return () => clearTimeout(timeout);
			}
			const timeout = setTimeout(() => {
				setIsPlaceholderTyping(false);
			}, 2000);
			return () => clearTimeout(timeout);
		}

		if (currentPlaceholderText.length > 0) {
			const timeout = setTimeout(() => {
				setCurrentPlaceholderText(currentPlaceholderText.slice(0, -1));
			}, 50);
			return () => clearTimeout(timeout);
		}

		setCurrentPlaceholderPhraseIndex(
			(prev) => (prev + 1) % placeholderPhrases.length,
		);
		setIsPlaceholderTyping(true);
	}, [
		currentPlaceholderText,
		currentPlaceholderPhraseIndex,
		isPlaceholderTyping,
		placeholderPhrases,
	]);

	const adjustTextareaHeight = () => {
		if (!textareaRef.current) return;
		textareaRef.current.style.height = 'auto';
		const scrollHeight = textareaRef.current.scrollHeight;
		const maxHeight = 300;
		textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
	};

	const handleCreateApp = async () => {
		if (isValidatingCredits) return;

		if (query.length > MAX_AGENT_QUERY_LENGTH) {
			toast.error(
				`Prompt too large (${query.length} characters). Maximum allowed is ${MAX_AGENT_QUERY_LENGTH} characters.`,
			);
			return;
		}

		const encodedQuery = encodeURIComponent(query);
		const encodedMode = encodeURIComponent(projectMode);
		const imageParam =
			images.length > 0
				? `&images=${encodeURIComponent(JSON.stringify(images))}`
				: '';
		const intendedUrl = `/chat/new?query=${encodedQuery}&projectType=${encodedMode}${imageParam}`;

		if (
			!requireAuth({
				requireFullAuth: true,
				actionContext: 'to create applications',
				intendedUrl,
			})
		) {
			return;
		}

		try {
			setIsValidatingCredits(true);
			const validation = await apiClient.validateCredits({
				action: 'create_project',
				query,
			});

			if (!validation.success || !validation.data?.allowed) {
				const reason =
					validation.data?.reason ||
					validation.error?.message ||
					'Insufficient credits';
				toast.error(reason);
				return;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to validate credits';
			toast.error(message);
			return;
		} finally {
			setIsValidatingCredits(false);
		}

		navigate(intendedUrl);
		clearImages();
	};

	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-12 text-center">
			<div className="mb-10 flex items-center justify-center gap-3">
				<img
					src="https://imbra.co.zm/assets/isaas/logo/imbra-logo.png"
					alt="Imbra"
					className="h-8 w-auto object-contain"
				/>
				<span className="text-text-tertiary/60 text-xl font-light">|</span>
				<span className="text-lg font-semibold tracking-wide text-text-primary">iCado</span>
			</div>

			{/* Heading */}
			<h1 className="mb-3 text-5xl font-bold tracking-tight text-text-primary">
				Create a new app
			</h1>
			<p className="mb-10 text-base text-text-tertiary">
				Describe what you want to build and start a new generation instantly.
			</p>

			{/* Input box */}
			<form
				method="POST"
				onSubmit={(e) => {
					e.preventDefault();
					void handleCreateApp();
				}}
				className="flex min-h-[140px] flex-col rounded-2xl border border-accent/20 bg-bg-4 p-5 text-left dark:bg-bg-2"
			>
				<div
					className={clsx(
						'relative flex flex-1 flex-col',
						isDragging && 'rounded-lg ring-2 ring-accent ring-offset-2',
					)}
					{...dragHandlers}
				>
					{isDragging && (
						<div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-accent/10 backdrop-blur-sm">
							<p className="font-medium text-accent">Drop images here</p>
						</div>
					)}
					<textarea
						ref={textareaRef}
						name="query"
						value={query}
						placeholder={`Create a ${currentPlaceholderText}`}
						className="z-20 w-full resize-none bg-transparent text-text-primary outline-0 ring-0 placeholder:text-text-primary/40"
						onChange={(e) => {
							setQuery(e.target.value);
							adjustTextareaHeight();
						}}
						onInput={adjustTextareaHeight}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								void handleCreateApp();
							}
						}}
					/>
					{images.length > 0 && (
						<div className="mt-3">
							<ImageAttachmentPreview images={images} onRemove={removeImage} />
						</div>
					)}
				</div>

				{/* Bottom bar */}
				<div className="mt-4 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<ImageUploadButton onFilesSelected={addImages} disabled={isProcessing} />
						{showModeSelector && (
							<ProjectModeSelector
								value={projectMode}
								onChange={setProjectMode}
								modes={modeOptions}
							/>
						)}
					</div>

					<button
						type="submit"
						disabled={!query.trim() || isValidatingCredits}
						className="rounded-xl bg-accent p-2.5 text-white transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40 [&>*]:size-5"
					>
						<ArrowRight />
					</button>
				</div>
			</form>

			{images.length > 0 && (
				<div className="mt-4 flex items-start gap-2 rounded-xl border border-accent/20 bg-bg-4/50 px-4 py-3 text-left dark:border-accent/30 dark:bg-bg-2/50">
					<Info className="mt-0.5 size-4 flex-shrink-0 text-accent" />
					<p className="text-xs leading-relaxed text-text-tertiary">
						<span className="font-medium text-text-secondary">Images Beta:</span>{' '}
						Images guide app layout and design but may not be replicated exactly.
						The coding agent cannot access images directly for app assets.
					</p>
				</div>
			)}
		</div>
	);
}